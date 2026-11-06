import { describe, expect, it } from "vitest";
import { partyOf, sampleNetworkInvoices } from "./graph.fixtures";
import { buildGraph, egoGraph } from "./graph";

const look = { party: partyOf, band: (v: string) => (v.startsWith("0x2222") ? ("A" as const) : undefined) };
const g = buildGraph(sampleNetworkInvoices, look);
const node = (name: string) => g.nodes.find((n) => n.name === name)!;
const linkOf = (kind: string, from: string, to: string) => g.links.find((l) => l.kind === kind && l.source === node(from).id && l.target === node(to).id);

describe("buildGraph", () => {
  it("one node per party with names and roles from the directory", () => {
    expect(node("buyer-agent.eth").role).toBe("buyer");
    expect(node("buyer-agent.eth").band).toBe("A");
    expect(node("cloudline-gpu.eth").role).toBe("supplier");
    expect(node("orbit-capital.eth").role).toBe("investor");
    expect(node("alice.eth").role).toBe("sponsor");
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(g.nodes.length);
  });

  it("aggregates invoices per pair: count, HBAR and worst health", () => {
    const owes = linkOf("owes", "cloudline-gpu.eth", "buyer-agent.eth")!;
    expect(owes.count).toBe(2); // #12, #13
    expect(owes.hbar).toBe(210);
    expect(owes.health).toBe("good");
    expect(linkOf("owes", "acme-labelling.eth", "globex-agent.eth")!.health).toBe("default"); // #19
    expect(linkOf("owes", "dataforge.eth", "northwind-agent.eth")!.health).toBe("late"); // #15 paid, #16 late
  });

  it("links investors only for funded invoices, and sponsors to their agent", () => {
    expect(linkOf("funded", "orbit-capital.eth", "buyer-agent.eth")!.count).toBe(2); // #11, #12
    expect(g.links.some((l) => l.kind === "funded" && l.target === node("initech-agent.eth").id)).toBe(false);
    const sponsor = linkOf("sponsors", "meera.eth", "globex-agent.eth")!;
    expect(sponsor.health).toBe("default");
    expect(sponsor.count).toBe(node("globex-agent.eth").invoices);
  });

  it("falls back to a short hex for unknown addresses", () => {
    const one = { ...sampleNetworkInvoices[0], supplier: "0x9999999999999999999999999999999999999999" as const };
    expect(buildGraph([one], look).nodes.some((n) => n.name === "0x9999…9999" && n.role === "supplier")).toBe(true);
  });
});

describe("egoGraph", () => {
  it("keeps only the agent and its direct neighbours", () => {
    const e = egoGraph(g, node("initech-agent.eth").id);
    expect(e.nodes.map((n) => n.name).sort()).toEqual(["acme-labelling.eth", "cloudline-gpu.eth", "dataforge.eth", "initech-agent.eth", "sam.eth"]);
    expect(e.links.every((l) => l.source === node("initech-agent.eth").id || l.target === node("initech-agent.eth").id)).toBe(true);
  });
});
