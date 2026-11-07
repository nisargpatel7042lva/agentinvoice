import Link from "next/link";
import { Banner } from "@/components/Banner";
import { CountUp } from "@/components/CountUp";
import { NetworkGraph } from "@/components/NetworkGraph";
import { Section } from "@/components/Section";
import { Table, TableBox, Td, Th } from "@/components/ui";
import type { Health } from "@/lib/graph";
import { formatMoney } from "@/lib/format";
import { loadNetwork } from "@/lib/network";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const ROLE: Record<string, string> = { buyer: "Buyer agent", supplier: "Supplier", investor: "Investor", sponsor: "Sponsor" };

const HEALTH: Record<Health, { label: string; cls: string }> = {
  good: { label: "Paid on time", cls: "text-status-paid bg-status-paid-bg" },
  late: { label: "Late", cls: "text-status-late bg-status-late-bg" },
  default: { label: "Default", cls: "text-status-defaulted bg-status-defaulted-bg" },
  open: { label: "Not settled", cls: "text-status-pending bg-status-pending-bg" },
};
const VERB = { owes: "invoiced", funded: "funded", sponsors: "vouches for" } as const;

export default async function NetworkPage() {
  const { nodes, links } = await loadNetwork();
  const name = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
  const problems = links.filter((l) => l.kind !== "sponsors" && (l.health === "late" || l.health === "default")).length;
  const sorted = [...links].sort((a, b) => b.hbar - a.hbar);

  const top = [...nodes].sort((a, b) => b.volume - a.volume).slice(0, 4);
  const d = (n: number) => ({ ["--d" as string]: n + "s" });

  return (
    <div className="flex flex-col gap-8">
      <Banner
        hue="lilac"
        eyebrow="Network"
        title={
          <>
            Every invoice,
            <br />
            <em>every connection.</em>
          </>
        }
        sub="Who owes whom, who funded whom, and which person vouches for each buyer agent. Thicker lines mean more money; the colour shows how it went."
        cards={
          <div className="grid grid-cols-2 gap-3">
            <div className="pl-card pl-glass" style={d(0.1)}>
              <span className="pl-k">Parties</span>
              <span className="pl-big mt-1 block"><CountUp value={nodes.length} /></span>
            </div>
            <div className="pl-card pl-coral sm:translate-y-5" style={d(0.22)}>
              <span className="pl-k">Connections</span>
              <span className="pl-big mt-1 block"><CountUp value={links.length} /></span>
            </div>
            <div className="pl-card pl-dark col-span-2 flex items-end justify-between gap-4" style={d(0.34)}>
              <span>
                <span className="pl-k block">Late or missed</span>
                <span className="mt-1 block text-xs text-white/60">Connections with a late payment or a default</span>
              </span>
              <span className="pl-serif text-[44px] leading-none">
                <CountUp value={problems} />
              </span>
            </div>
          </div>
        }
      />

      {nodes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-ink-muted">No invoices yet, so there is nothing to connect.</p>
      ) : (
        // Always dark, like the landing page's closing panel: the graph glows on it.
        <section data-theme="dark" aria-label="Network graph" className="rounded-[24px] bg-canvas p-4 text-ink sm:p-6">
          <div className="hidden sm:block">
            <NetworkGraph nodes={nodes} links={links} />
          </div>
          <div className="sm:hidden">
            <NetworkGraph nodes={nodes} links={links} height={380} compact />
          </div>
        </section>
      )}

      {top.length > 0 && (
        <section aria-labelledby="top-title">
          <h2 id="top-title" className="text-lg font-semibold tracking-[-0.02em]">
            Most active <span className="pl-serif text-accent">parties</span>
          </h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {top.map((n, i) => {
              const skin = ["pl-paper", "pl-coral", "pl-dark", "pl-paper"][i];
              const body = (
                <>
                  <span className="pl-k">{ROLE[n.role]}</span>
                  <span className="mt-2 block truncate text-base font-semibold">{n.name}</span>
                  <span className={"mt-3 flex items-baseline justify-between gap-2 border-t pt-3 text-[13px] " + (skin === "pl-dark" ? "border-white/15" : "border-[#161513]/15")}>
                    <span>{n.invoices} invoices</span>
                    <span className="font-semibold">{formatMoney(n.volume)}</span>
                  </span>
                </>
              );
              return (
                <li key={n.id}>
                  {n.role === "buyer" ? (
                    <Link href={"/agent/" + n.id} className={"pl-card pl-lift block h-full p-5 " + skin} style={d(0.06 * i)}>{body}</Link>
                  ) : (
                    <div className={"pl-card h-full p-5 " + skin} style={d(0.06 * i)}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Section title={`All connections (${links.length})`} hint="The same network as a list, biggest first" open={false}>
        <TableBox>
          <Table className="min-w-[560px]">
            <thead>
              <tr><Th>From</Th><Th>Connection</Th><Th>To</Th><Th className="text-right">Invoices</Th><Th className="text-right">Amount</Th><Th>Outcome</Th></tr>
            </thead>
            <tbody>
              {sorted.map((l) => (
                <tr key={l.id}>
                  <Td className="font-medium">{name(l.source)}</Td>
                  <Td className="text-ink-muted">{VERB[l.kind]}</Td>
                  <Td className="font-medium">{name(l.target)}</Td>
                  <Td className="text-right">{l.count}</Td>
                  <Td className="text-right">{formatMoney(l.hbar)}</Td>
                  <Td><span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", HEALTH[l.health].cls)}>{HEALTH[l.health].label}</span></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableBox>
      </Section>
    </div>
  );
}
