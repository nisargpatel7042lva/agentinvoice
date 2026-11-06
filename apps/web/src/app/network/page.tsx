import { NetworkGraph } from "@/components/NetworkGraph";
import { Section } from "@/components/Section";
import { Table, TableBox, Td, Th } from "@/components/ui";
import type { Health } from "@/lib/graph";
import { formatHbar } from "@/lib/format";
import { loadNetwork } from "@/lib/network";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

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

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[28px] leading-9 font-semibold tracking-tight">Network</h1>
        <p className="mt-1.5 max-w-2xl text-[15px] text-ink-muted">
          Who owes whom, who funded whom, and which person vouches for each buyer agent. Thicker lines mean more money, and the colour shows how it went.
        </p>
        <ul aria-label="Network summary" className="mt-3 flex flex-wrap gap-2 text-[13px]">
          <li className="rounded-full border border-line bg-surface px-3 py-1 text-ink-soft"><span className="font-semibold text-ink">{nodes.length}</span> parties</li>
          <li className="rounded-full border border-line bg-surface px-3 py-1 text-ink-soft"><span className="font-semibold text-ink">{links.length}</span> connections</li>
          <li className="rounded-full border border-line bg-surface px-3 py-1 text-ink-soft"><span className={cn("font-semibold", problems ? "text-status-late" : "text-ink")}>{problems}</span> with late or missed payments</li>
        </ul>
      </div>

      {nodes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-ink-muted">No invoices yet, so there is nothing to connect.</p>
      ) : (
        <>
          <div className="hidden sm:block">
            <NetworkGraph nodes={nodes} links={links} />
          </div>
          <div className="sm:hidden">
            <NetworkGraph nodes={nodes} links={links} height={380} compact />
          </div>
        </>
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
                  <Td className="text-right">{formatHbar(l.hbar)}</Td>
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
