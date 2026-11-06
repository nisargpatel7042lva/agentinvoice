import { formatUnits, type Address, type ApiClient, type Hash32, type Invoice } from "@agentinvoice/shared";
import { decide, decisionLine } from "./decide.js";
import { reviewInvoice, type InvoiceModel, type InvoiceReview } from "./review.js";

export const MAX_RETRIES = 3;

export interface BuyerDeps {
  api: Pick<ApiClient, "listInvoices" | "getInvoice">;
  vaultAddress: Address;
  marketAddress: Address;
  readSupplier: (supplier: Address) => Promise<{ allowed: boolean; limit: bigint }>;
  readThreshold: () => Promise<bigint>;
  readDailyLimit: () => Promise<bigint>;
  readSpentToday: () => Promise<bigint>;
  readBalance: () => Promise<bigint>;
  accept: (id: bigint) => Promise<Hash32>;
  pay: (id: bigint) => Promise<Hash32>;
  model?: InvoiceModel;
  dryRun?: boolean;
  log?: (line: string) => void;
  now?: () => number;
}

export function createBuyerAgent(deps: BuyerDeps) {
  const log = deps.log ?? console.log;
  const failures = new Map<string, number>();
  const paid = new Set<string>();
  const reviews = new Map<string, InvoiceReview>();
  let stopped = false;

  async function reviewed(invoice: Invoice): Promise<InvoiceReview> {
    const key = `${invoice.id}:${invoice.evidenceHash.toLowerCase()}`;
    const cached = reviews.get(key);
    if (cached) return cached;
    const review = deps.model
      ? await reviewInvoice(invoice, invoice.description, invoice.evidenceHash, deps.model)
      : { action: "escalate" as const, reason: "model is not configured" };
    reviews.set(key, review);
    return review;
  }

  const ours = (invoice: Invoice) => invoice.buyerVault.toLowerCase() === deps.vaultAddress.toLowerCase();

  async function tick(): Promise<void> {
    const [pending, funded] = await Promise.all([
      deps.api.listInvoices("Pending"),
      deps.api.listInvoices("Funded"),
    ]);
    const listed = [
      ...funded.filter(ours).sort((a, b) => a.dueDate - b.dueDate || Number(a.id) - Number(b.id)),
      ...pending.filter(ours),
    ];
    if (listed.length === 0 || stopped) return;
    const now = deps.now?.() ?? Math.floor(Date.now() / 1000);

    for (const item of listed) {
      if (stopped) break;
      try {
        const invoice = await deps.api.getInvoice(item.id);
        if (!ours(invoice)) continue;
        const [supplier, threshold, dailyLimit, spentToday, balance] = await Promise.all([
          deps.readSupplier(invoice.supplier),
          deps.readThreshold(),
          deps.readDailyLimit(),
          deps.readSpentToday(),
          deps.readBalance(),
        ]);
        const decision = decide({
          invoice,
          supplierAllowed: supplier.allowed,
          supplierLimit: supplier.limit,
          approvalThreshold: threshold,
          dailyLimit,
          spentToday,
          balance,
          now,
          sponsorApprovalAvailable: false,
        });
        const face = formatUnits(invoice.faceAmount);
        const tries = failures.get(invoice.id) ?? 0;
        if (decision.action !== "skip" && tries >= MAX_RETRIES) {
          log(`${decisionLine(invoice.id, { action: "skip", reason: `gave up after ${MAX_RETRIES} failed tries` })} face=${face}`);
          continue;
        }
        if (decision.action === "skip") {
          log(`${decisionLine(invoice.id, decision)} face=${face}`);
          continue;
        }
        if (decision.action === "pay") {
          if (paid.has(invoice.id)) {
            log(`${decisionLine(invoice.id, { action: "skip", reason: "already paid in this run" })} face=${face}`);
            continue;
          }
          const review = await reviewed(invoice);
          if (review.action === "dispute") {
            log(`invoice=${invoice.id} action=dispute reason="${review.reason}" face=${face}`);
            continue;
          }
          if (review.action !== "accept") {
            log(`invoice=${invoice.id} action=escalate reason="sponsor approval is needed" face=${face}`);
            continue;
          }
        }
        if (deps.dryRun) {
          log(`${decisionLine(invoice.id, decision)} dry-run face=${face}`);
          continue;
        }
        const hash = decision.action === "accept" ? await deps.accept(BigInt(invoice.id)) : await deps.pay(BigInt(invoice.id));
        if (decision.action === "pay") paid.add(invoice.id);
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
