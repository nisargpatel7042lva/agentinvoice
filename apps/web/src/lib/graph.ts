// Turns invoices into a network: who owes whom, who funded whom, who vouches for which agent.
// Pure and data-driven: every node and link comes from invoices (plus the name directory), nothing invented.
import { formatUnits, type Invoice, type ScoreBand } from "@invoiceagent/shared";
export type Role = "buyer" | "supplier" | "investor" | "sponsor";
import { shortHex } from "./format";

export type Health = "good" | "late" | "default" | "open";
export type LinkKind = "owes" | "funded" | "sponsors";

export interface GraphNode {
  id: string; // lower-case address
  name: string;
  role: Role;
  band?: ScoreBand;
  volume: number; // HBAR of invoices touching this party
  invoices: number;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  kind: LinkKind;
  count: number;
  hbar: number;
  health: Health;
}

export interface Lookup {
  /** Name, role and sponsor for an address, if known. */
  party: (address: string) => { name: string; role: Role; sponsor?: string } | undefined;
  /** Score band for a buyer vault, if known. */
  band?: (vault: string) => ScoreBand | undefined;
}

const RANK: Record<Health, number> = { open: 0, good: 1, late: 2, default: 3 };
const healthOf = (inv: Invoice): Health =>
  inv.status === "Defaulted" ? "default" : inv.status === "Late" ? "late" : inv.status === "Paid" ? "good" : "open";
const worse = (a: Health, b: Health) => (RANK[b] > RANK[a] ? b : a);
const hbar = (amount: string) => Number(formatUnits(amount));

export function buildGraph(invoices: Invoice[], look: Lookup): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes = new Map<string, GraphNode>();
  const links = new Map<string, GraphLink>();

  const node = (address: string, fallbackRole: Role): GraphNode => {
    const id = address.toLowerCase();
    let n = nodes.get(id);
    if (!n) {
      const p = look.party(id);
      n = { id, name: p?.name ?? shortHex(address), role: p?.role ?? fallbackRole, volume: 0, invoices: 0 };
      if (n.role === "buyer") n.band = look.band?.(id);
      nodes.set(id, n);
    }
    return n;
  };

  const link = (from: GraphNode, to: GraphNode, kind: LinkKind, inv?: Invoice) => {
    const id = `${kind}:${from.id}->${to.id}`;
    let l = links.get(id);
    if (!l) {
      l = { id, source: from.id, target: to.id, kind, count: 0, hbar: 0, health: "open" };
      links.set(id, l);
    }
    if (inv) {
      l.count += 1;
      l.hbar += hbar(inv.faceAmount);
      l.health = worse(l.health, healthOf(inv));
    }
    return l;
  };

  for (const inv of invoices) {
    const face = hbar(inv.faceAmount);
    const supplier = node(inv.supplier, "supplier");
    const buyer = node(inv.buyerVault, "buyer");
    supplier.volume += face;
    supplier.invoices += 1;
    buyer.volume += face;
    buyer.invoices += 1;
    link(supplier, buyer, "owes", inv);

    if (inv.holder) {
      const investor = node(inv.holder, "investor");
      investor.volume += face;
      investor.invoices += 1;
      link(investor, buyer, "funded", inv);
    }
  }

  // Sponsors vouch for buyer agents: one dashed link each, health = the agent's worst outcome.
  for (const buyer of [...nodes.values()].filter((n) => n.role === "buyer")) {
    const sponsorAddr = look.party(buyer.id)?.sponsor;
    if (!sponsorAddr) continue;
    const sponsor = node(sponsorAddr, "sponsor");
    sponsor.volume += buyer.volume;
    sponsor.invoices += buyer.invoices;
    const l = link(sponsor, buyer, "sponsors");
    l.count = buyer.invoices;
    l.hbar = buyer.volume;
    l.health = [...links.values()].filter((x) => x.target === buyer.id && x.kind === "owes").reduce<Health>((h, x) => worse(h, x.health), "open");
  }

  return { nodes: [...nodes.values()], links: [...links.values()] };
}

/** Only `centerId` and its direct neighbours (used for the mini-graph on an agent profile). */
export function egoGraph(g: { nodes: GraphNode[]; links: GraphLink[] }, centerId: string) {
  const c = centerId.toLowerCase();
  const links = g.links.filter((l) => l.source === c || l.target === c);
  const keep = new Set([c, ...links.flatMap((l) => [l.source, l.target])]);
  return { nodes: g.nodes.filter((n) => keep.has(n.id)), links };
}
