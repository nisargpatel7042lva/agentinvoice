import { tinybarToWeibar, type ApiClient, type Hash32, type Invoice, type BuyerScore } from "@agentinvoice/shared";
import { decide, discountBps, type Decision, type Rules } from "./decide.js";

/** Buys an invoice on-chain. Implemented with viem in main.ts; faked in tests. `value` is msg.value in weibar. */
export type BuyFn = (id: bigint, valueWeibar: bigint) => Promise<Hash32>;

export interface AgentDeps {
  api: Pick<ApiClient, "listInvoices">;
  getScore: (vault: string) => Promise<BuyerScore>;
  buy: BuyFn;
  rules: Rules;
  dryRun?: boolean;
  log?: (line: string) => void;
  txUrl?: (hash: Hash32) => string;
}

export const MAX_RETRIES = 3;

export function listOpenInvoices(api: AgentDeps["api"]): Promise<Invoice[]> {
  return api.listInvoices("Open");
}

export function createInvestorAgent(deps: AgentDeps) {
  const log = deps.log ?? console.log;
  const exposure = new Map<string, bigint>(); // vault -> price we funded and not yet repaid
  const failures = new Map<string, number>(); // invoice id -> failed buy attempts
  let stopped = false;

  function line(inv: Invoice, score: BuyerScore | null, d: Decision, outcome: string) {
    log(`invoice=${inv.id} band=${score?.band ?? "?"} discount=${discountBps(inv)}bps ${outcome} reason="${d.reason}"`);
  }

  /** One pass: at most one buy. Returns the bought invoice id, if any. */
  async function tick(): Promise<string | null> {
    const invoices = await listOpenInvoices(deps.api);
    let bought: string | null = null;
    for (const inv of invoices) {
      if (stopped) break;
      const score = await deps.getScore(inv.buyerVault).catch(() => null);
      const vault = inv.buyerVault.toLowerCase();
      let d = decide(inv, score, deps.rules, exposure.get(vault) ?? 0n);
      if (d.action === "buy" && bought) d = { action: "skip", reason: "already bought one invoice this loop" };
      if (d.action === "buy" && (failures.get(inv.id) ?? 0) >= MAX_RETRIES) d = { action: "skip", reason: `gave up after ${MAX_RETRIES} failed buys` };
      if (d.action === "skip") {
        line(inv, score, d, "skipped");
        continue;
      }
      if (deps.dryRun) {
        line(inv, score, d, "dry-run would buy");
        bought = inv.id;
        continue;
      }
      try {
        const hash = await deps.buy(BigInt(inv.id), tinybarToWeibar(inv.price));
        exposure.set(vault, (exposure.get(vault) ?? 0n) + BigInt(inv.price));
        line(inv, score, d, `bought tx=${deps.txUrl ? deps.txUrl(hash) : hash}`);
        bought = inv.id;
      } catch (err) {
        const n = (failures.get(inv.id) ?? 0) + 1;
        failures.set(inv.id, n);
        line(inv, score, d, `buy failed (${n}/${MAX_RETRIES}): ${(err as Error).message}`);
      }
    }
    return bought;
  }

  async function run(intervalMs = 20_000) {
    while (!stopped) {
      await tick().catch((e) => log(`loop error: ${(e as Error).message}`));
      if (stopped) break;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  return { tick, run, stop: () => { stopped = true; }, exposure };
}
