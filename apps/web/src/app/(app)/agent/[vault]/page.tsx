import Link from "next/link";
import type { Address } from "@invoiceagent/shared";
import { Legend, RepaymentChart } from "@/components/charts";
import { CreditScoreCard } from "@/components/CreditScoreCard";
import { EnsPanel, PermissionsPanel } from "@/components/EnsPanel";
import { NetworkGraph } from "@/components/NetworkGraph";
import { egoGraph } from "@/lib/graph";
import { loadNetwork } from "@/lib/network";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Section } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { Term } from "@/components/Term";
import { TxLink } from "@/components/TxLink";
import { buttonVariants, Table, TableBox, Td, Th } from "@/components/ui";
import { Banner } from "@/components/Banner";
import { api } from "@/lib/api";
import { readSpentToday } from "@/lib/credit";
import { loadEnsByVault } from "@/lib/agents";
import { loadCreditReport } from "@/lib/credit";
import { copy } from "@/lib/copy";
import { formatAmount, formatDate, shortHex } from "@/lib/format";
import { repaymentsByWeek } from "@/lib/stats";

export const dynamic = "force-dynamic";


export default async function AgentPage({ params }: { params: Promise<{ vault: string }> }) {
  const { vault } = await params;
  const [ens, creditReport, invoices, network] = await Promise.all([
    loadEnsByVault(vault),
    loadCreditReport(vault),
    api.listInvoices().catch(() => []),
    loadNetwork(),
  ]);
  const ego = egoGraph(network, vault);
  const agent = "agent" in ens ? ens.agent : undefined;
  // The agent's ENS name when it has published records; otherwise the short vault address.
  const displayName = agent?.name;
  const mine = invoices.filter((i) => i.buyerVault.toLowerCase() === vault.toLowerCase());
  const weekly = repaymentsByWeek(mine);
  const settled = creditReport?.counts.settled ?? 0;
  const spent = await readSpentToday(vault);
  const spentPct = spent && agent ? (Number(spent) / Number(agent.limit)) * 100 : null;
  const summary = creditReport?.summary ?? (settled === 0 ? "No payment history yet." : `${settled} settled invoices.`);

  const bandWord = creditReport ? (creditReport.band === "New" ? "new to the network" : "a Band " + creditReport.band + " payer") : "no score yet";
  const d = (n: number) => ({ ["--d" as string]: n + "s" });

  return (
    <div className="flex flex-col gap-8">
      <Banner
        hue="lilac"
        eyebrow="Buyer agent"
        title={
          <>
            {displayName ?? shortHex(vault)}
            <br />
            <em>{bandWord}.</em>
          </>
        }
        sub={
          <>
            {summary}
            <span className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm">
              <Term explain="agent">Software that pays</Term> from <TxLink address={vault as Address} />
            </span>
          </>
        }
        action={
          mine.some((i) => i.status === "Open") ? (
            <Link href="/market" className={buttonVariants({ size: "lg" })}>
              Fund its invoices
            </Link>
          ) : undefined
        }
        cards={
          <div className="grid grid-cols-2 gap-3">
            <div className="pl-card pl-dark col-span-2 flex items-end justify-between gap-4 p-5 sm:col-span-1 sm:row-span-2 sm:flex-col sm:items-start" style={d(0.1)}>
              <span className="pl-k">Credit score</span>
              <span className="pl-serif text-[64px] leading-none">{creditReport?.score ?? "—"}</span>
              <span className="flex items-center gap-2 text-xs text-white/60">
                {creditReport && <ScoreBadge band={creditReport.band} score={creditReport.score} />}
                300 to 900
              </span>
            </div>
            <div className="pl-card pl-coral flex flex-col gap-1.5" style={d(0.22)}>
              <span className="pl-k">Spent today</span>
              <span className="pl-big">{spent ? formatAmount(spent) : "—"}</span>
              {spentPct != null && (
                <span role="progressbar" aria-label="Share of daily limit spent today" aria-valuenow={Math.round(spentPct)} aria-valuemin={0} aria-valuemax={100} className="block h-1.5 overflow-hidden rounded-full bg-white/50">
                  <span className="block h-full rounded-full bg-[#161513]" style={{ width: Math.min(100, spentPct) + "%" }} />
                </span>
              )}
              {agent && <span className="text-[11.5px] opacity-75">of {formatAmount(agent.limit)} a day</span>}
            </div>
            <div className="pl-card pl-glass grid grid-cols-3 gap-2" style={d(0.34)}>
              {[
                ["On time", creditReport?.counts.onTime],
                ["Late", creditReport ? creditReport.counts.paidLate + creditReport.counts.late : undefined],
                ["Defaulted", creditReport?.counts.defaulted],
              ].map(([k, v]) => (
                <span key={k as string}>
                  <span className="block text-[10.5px] font-semibold tracking-[0.06em] uppercase opacity-65">{k}</span>
                  <span className="mt-0.5 block text-xl font-semibold">{v ?? "—"}</span>
                </span>
              ))}
            </div>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0">{creditReport && <CreditScoreCard report={creditReport} />}</div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <EnsPanel state={ens} vaultOnChain={vault as Address} />
        </aside>
      </div>

      {ego.links.length > 0 && (
        <section data-theme="dark" aria-labelledby="conn-title" className="flex flex-col gap-3 rounded-[24px] bg-canvas p-5 text-ink sm:p-6">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="conn-title" className="text-lg font-semibold tracking-[-0.02em]">
              Who it <span className="pl-serif text-accent">deals with</span>
            </h2>
            <Link href="/network" className="text-sm text-ink-muted hover:text-ink">Open full network</Link>
          </div>
          <NetworkGraph nodes={ego.nodes} links={ego.links} height={320} compact focusId={vault} />
        </section>
      )}

      <div className="flex flex-col gap-4">
      <Section title={copy.sections.permissions} hint="Sponsor, publisher and registry each control different values">
        <PermissionsPanel />
      </Section>

      <Section title="Repayment history" hint={weekly.length ? "On time, late and defaulted, by due week" : copy.empty.agentHistory}>
        {weekly.length === 0 ? (
          <p className="text-sm text-ink-muted">{copy.empty.agentHistory}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <Legend items={[{ label: "On time", color: "accent" }, { label: "Late", color: "warn" }, { label: "Defaulted", color: "danger" }]} />
            <RepaymentChart data={weekly} />
          </div>
        )}
      </Section>

      <Section title={`Invoices (${mine.length})`} hint="Every invoice this buyer has accepted or been sent">
        {mine.length === 0 ? (
          <p className="text-sm text-ink-muted">{copy.empty.agentHistory}</p>
        ) : (
          <TableBox>
            <Table className="min-w-[480px]">
              <thead><tr><Th>Invoice</Th><Th className="text-right">Amount</Th><Th>Due</Th><Th>Status</Th></tr></thead>
              <tbody>
                {mine.map((i) => (
                  <tr key={i.id}>
                    <Td><Link href={`/invoice/${i.id}`} className="font-mono text-[13px] text-accent">#{i.id}</Link></Td>
                    <Td className="text-right">{formatAmount(i.faceAmount)}</Td>
                    <Td className="text-ink-soft">{formatDate(i.dueDate)}</Td>
                    <Td><StatusBadge status={i.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableBox>
        )}
      </Section>

      </div>
    </div>
  );
}
