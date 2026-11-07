import { formatUnits, type Address, type ApiClient, type Hash32 } from "@invoiceagent/shared";
import type { Hex } from "viem";
import { decide, decisionLine } from "./decide.js";

export const MAX_RETRIES = 3;

/** What the agent can do for one vault: read its rules and spend from it. */
export interface VaultOps {
  readSupplier: (supplier: Address) => Promise<{ allowed: boolean; limit: bigint }>;
  readThreshold: () => Promise<bigint>;
  accept: (id: bigint) => Promise<Hash32>;
  pay: (id: bigint, approval?: Hex) => Promise<Hash32>;
}

export interface BuyerDeps extends VaultOps {
  api: Pick<ApiClient, "listInvoices" | "getInvoice">;
  /** The signed sponsor approval for an invoice above the vault's threshold, or null until a World-verified human has approved it. */
  approvalFor?: (invoiceId: string) => Promise<Hex | null>;
  vaultAddress: Address; // the default vault, served with the ops above
  marketAddress: Address;
  /** Other vaults to serve, such as ones buyers registered on the website. Optional; a failed read means only the default vault this tick. */
  extraVaults?: () => Promise<Address[]>;
  /** Ops for an extra vault, or null when this agent must not spend from it (its on-chain agent is someone else). */
  opsFor?: (vault: Address) => Promise<VaultOps | null>;
  dryRun?: boolean;
  log?: (line: string) => void;
  now?: () => number;
}

export function createBuyerAgent(deps: BuyerDeps) {
  const log = deps.log ?? console.log;
  const failures = new Map<string, number>();
  let stopped = false;

  const key = (vault: string) => vault.toLowerCase();
  const defaultOps: VaultOps = { readSupplier: deps.readSupplier, readThreshold: deps.readThreshold, accept: deps.accept, pay: deps.pay };
  const ownVault = key(deps.vaultAddress);
  const refused = new Set<string>(); // extra vaults this agent may not spend from, logged once

  // Vault -> ops for this tick: the default vault, plus every extra vault this agent is allowed to spend from.
  async function servedVaults(): Promise<Map<string, VaultOps>> {
    const served = new Map<string, VaultOps>([[ownVault, defaultOps]]);
    if (!deps.extraVaults || !deps.opsFor) return served;
    const extras = await deps.extraVaults().catch(() => [] as Address[]);
    for (const vault of extras) {
      const k = key(vault);
      if (served.has(k) || refused.has(k)) continue;
      try {
        const ops = await deps.opsFor(vault);
        if (ops) served.set(k, ops);
        else {
          refused.add(k);
          log(`vault=${vault} skipped: this agent is not its on-chain agent`);
        }
      } catch (error) {
        log(`vault=${vault} not ready this round: ${(error as Error).message}`); // retried next tick
      }
    }
    return served;
  }

  async function tick(): Promise<void> {
    const [pending, funded] = await Promise.all([
      deps.api.listInvoices("Pending"),
      deps.api.listInvoices("Funded"),
    ]);
    const all = [...pending, ...funded];
    if (all.length === 0 || stopped) return;
    const served = await servedVaults();
    const listed = all.filter((invoice) => served.has(key(invoice.buyerVault)));
    if (listed.length === 0 || stopped) return;
    const thresholds = new Map<string, bigint>();
    const now = deps.now?.() ?? Math.floor(Date.now() / 1000);

    for (const item of listed) {
      if (stopped) break;
      try {
        const invoice = await deps.api.getInvoice(item.id);
        const vaultKey = key(invoice.buyerVault);
        const ops = served.get(vaultKey);
        if (!ops) continue;
        if (!thresholds.has(vaultKey)) thresholds.set(vaultKey, await ops.readThreshold());
        const threshold = thresholds.get(vaultKey) as bigint;
        const supplier = await ops.readSupplier(invoice.supplier);
        // Above the threshold the vault wants a signed approval. Ask for it only when the invoice is due, so we never nag the backend early.
        const face = BigInt(invoice.faceAmount);
        let approval: Hex | null = null;
        if (invoice.status === "Funded" && now >= invoice.dueDate && face > threshold && deps.approvalFor) {
          approval = await deps.approvalFor(invoice.id).catch(() => null);
        }
        const decision = decide({
          invoice,
          supplierAllowed: supplier.allowed,
          supplierLimit: supplier.limit,
          approvalThreshold: threshold,
          now,
          sponsorApprovalAvailable: approval !== null,
        });
        const faceText = formatUnits(invoice.faceAmount);
        const tries = failures.get(invoice.id) ?? 0;
        if (decision.action !== "skip" && tries >= MAX_RETRIES) {
          log(`${decisionLine(invoice.id, { action: "skip", reason: `gave up after ${MAX_RETRIES} failed tries` })} face=${faceText}`);
          continue;
        }
        if (decision.action === "skip" || deps.dryRun) {
          const dry = deps.dryRun && decision.action !== "skip" ? " dry-run" : "";
          log(`${decisionLine(invoice.id, decision)}${dry} face=${faceText}`);
          continue;
        }
        const hash = decision.action === "accept" ? await ops.accept(BigInt(invoice.id)) : (approval ? await ops.pay(BigInt(invoice.id), approval) : await ops.pay(BigInt(invoice.id)));
        log(`${decisionLine(invoice.id, decision)} tx=${hash} face=${faceText}`);
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
