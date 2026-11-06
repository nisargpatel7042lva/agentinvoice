import { formatUnits, type Address, type ApiClient, type Hash32, type Invoice } from "@agentinvoice/shared";
import { decide, decisionLine } from "./decide.js";

export const MAX_RETRIES = 3;

export interface BuyerDeps {
  api: Pick<ApiClient, "listInvoices" | "getInvoice">;
  vaultAddress: Address;
  marketAddress: Address;
  readSupplier: (supplier: Address) => Promise<{ allowed: boolean; limit: bigint }>;
  readThreshold: () => Promise<bigint>;
  accept: (id: bigint) => Promise<Hash32>;
  pay: (id: bigint) => Promise<Hash32>;
  dryRun?: boolean;
  log?: (line: string) => void;
  now?: () => number;
}

export function createBuyerAgent(deps: BuyerDeps) {
  const log = deps.log ?? console.log;
  const failures = new Map<string, number>();
  let stopped = false;

  const ours = (invoice: Invoice) => invoice.buyerVault.toLowerCase() === deps.vaultAddress.toLowerCase();

  async function tick(): Promise<void> {
    const [pending, funded] = await Promise.all([
      deps.api.listInvoices("Pending"),
      deps.api.listInvoices("Funded"),
    ]);
    const listed = [...pending, ...funded].filter(ours);
    if (listed.length === 0 || stopped) return;
    const threshold = await deps.readThreshold();
    const now = deps.now?.() ?? Math.floor(Date.now() / 1000);

    for (const item of listed) {
      if (stopped) break;
      try {
        const invoice = await deps.api.getInvoice(item.id);
        if (!ours(invoice)) continue;
        const supplier = await deps.readSupplier(invoice.supplier);
        const decision = decide({
          invoice,
          supplierAllowed: supplier.allowed,
          supplierLimit: supplier.limit,
          approvalThreshold: threshold,
          now,
          sponsorApprovalAvailable: false,
        });
        const face = formatUnits(invoice.faceAmount);
        const tries = failures.get(invoice.id) ?? 0;
        if (decision.action !== "skip" && tries >= MAX_RETRIES) {
          log(`${decisionLine(invoice.id, { action: "skip", reason: `gave up after ${MAX_RETRIES} failed tries` })} face=${face}`);
          continue;
        }
        if (decision.action === "skip" || deps.dryRun) {
          const dry = deps.dryRun && decision.action !== "skip" ? " dry-run" : "";
          log(`${decisionLine(invoice.id, decision)}${dry} face=${face}`);
          continue;
        }
        const hash = decision.action === "accept" ? await deps.accept(BigInt(invoice.id)) : await deps.pay(BigInt(invoice.id));
        log(`${decisionLine(invoice.id, decision)} tx=${hash} face=${face}`);
      } catch (error) {
        const n = (failures.get(item.id) ?? 0) + 1;
        failures.set(item.id, n);
        log(`invoice=${item.id} action=error failed (${n}/${MAX_RETRIES}): ${(error as Error).message}`);
      }
    }
  }

  async function run(intervalMs: number, stop?: { stopped: boolean }): Promise<void> {
    const shouldStop = () => stopped || Boolean(stop?.stopped);
    log("started");
    while (!shouldStop()) {
      await tick().catch((error) => log(`loop error: ${(error as Error).message}`));
      if (shouldStop()) break;
      await wait(intervalMs, shouldStop);
    }
    log("stopped");
  }

  return { tick, run, stop: () => { stopped = true; } };
}

async function wait(ms: number, shouldStop: () => boolean): Promise<void> {
  const ends = Date.now() + ms;
  while (!shouldStop() && Date.now() < ends) {
    const slice = Math.min(50, ends - Date.now());
    await new Promise((resolve) => setTimeout(resolve, slice));
  }
}
