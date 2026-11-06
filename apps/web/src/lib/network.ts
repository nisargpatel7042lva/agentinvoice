import "server-only";
import { api } from "./api";
import { loadScore } from "./agents";
import { buildGraph } from "./graph";

/** Builds the whole network from the current invoices (demo store or real backend). */
export async function loadNetwork() {
  const invoices = await api.listInvoices().catch(() => []);
  const buyers = [...new Set(invoices.map((i) => i.buyerVault.toLowerCase()))];
  const bands = new Map(await Promise.all(buyers.map(async (v) => [v, (await loadScore(v))?.band] as const)));
  // Names fall back to short addresses until ENS reverse lookup lands.
  return buildGraph(invoices, { party: () => undefined, band: (v) => bands.get(v.toLowerCase()) });
}
