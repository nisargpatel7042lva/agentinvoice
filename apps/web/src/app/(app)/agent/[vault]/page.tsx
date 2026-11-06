import Link from "next/link";
import { payPolicyFixture, type Address } from "@agentinvoice/shared";
import { Legend, RepaymentChart } from "@/components/charts";
import { CreditScoreCard } from "@/components/CreditScoreCard";
import { EnsPanel, PermissionsPanel } from "@/components/EnsPanel";
import { NetworkGraph } from "@/components/NetworkGraph";
import { egoGraph } from "@/lib/graph";
import { loadNetwork } from "@/lib/network";
import { partyOf } from "@/lib/directory";
import { PolicyPanel } from "@/components/PolicyPanel";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Section } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { Term } from "@/components/Term";
import { TxLink } from "@/components/TxLink";
import { Progress, StatCard, Table, TableBox, Td, Th } from "@/components/ui";
import { api, isMock } from "@/lib/api";
import { loadEnsByVault } from "@/lib/agents";
import { loadCreditReport } from "@/lib/credit";
import { copy } from "@/lib/copy";
import { formatAmount, formatDate, shortHex } from "@/lib/format";
import { repaymentsByWeek } from "@/lib/stats";

export const dynamic = "force-dynamic";

// Spent-today comes from the vault contract; mock mode shows a sample value.
const MOCK_SPENT_TODAY = "1200000000";

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
  // ENS name when published; in demo mode fall back to the sample directory.
  const displayName = agent?.name ?? (isMock ? partyOf(vault)?.name : undefined);
  const mine = invoices.filter((i) => i.buyerVault.toLowerCase() === vault.toLowerCase());
  const weekly = repaymentsByWeek(mine);
  const settled = creditReport?.counts.settled ?? 0;
  const spent = isMock ? MOCK_SPENT_TODAY : null;
  const spentPct = spent && agent ? (Number(spent) / Number(agent.limit)) * 100 : null;
  const summary = creditReport?.summary ?? (settled === 0 ? "No payment history yet." : `${settled} settled invoices.`);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-center gap-4">
        <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-[14px] bg-ink text-xl font-semibold text-canvas">
          {(displayName ?? vault.slice(2)).slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-60 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[30px] leading-9 font-semibold tracking-[-0.025em]">{displayName ?? shortHex(vault)}</h1>
            {creditReport && (
              <Term explain="score">
                <ScoreBadge band={creditReport.band} score={creditReport.score} />
              </Term>
            )}
          </div>
          <p className="mt-1 text-[15px] text-ink-soft">{summary}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-muted">
            <Term explain="agent">Buyer agent</Term> · pays from <TxLink address={vault as Address} />
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
      <section aria-label="Key figures" className="flex flex-col gap-4">
        <StatCard
          label="Repayment track record"
          value={creditReport?.score !== null && creditReport?.score !== undefined ? `${creditReport.score}` : "—"}
          sub={
            creditReport
              ? `${creditReport.counts.onTime} on time · ${creditReport.counts.paidLate} paid late · ${creditReport.counts.defaulted} defaulted`
              : copy.scoreHelp.New
          }
        />
        <StatCard label="Spent today" value={spent ? formatAmount(spent) : "—"} sub={agent ? `Limit ${formatAmount(agent.limit)} a day, set by the sponsor` : undefined}>
          {spentPct != null && <Progress value={spentPct} label="Share of daily limit spent today" />}
        </StatCard>
      </section>
      {isMock && agent && (
        <Section open title={copy.policy.title} hint="Limits the sponsor set for this agent">
          <PolicyPanel policy={payPolicyFixture} dailyLimit={agent.limit} threshold={agent.threshold} spentToday={spent ?? "0"} allowedSuppliers={3} />
        </Section>
      )}
        </aside>
        <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
      {/* Credit score breakdown card */}
      {creditReport && <CreditScoreCard report={creditReport} />}


      <EnsPanel state={ens} vaultOnChain={vault as Address} />

      {ego.links.length > 0 && (
        <section aria-labelledby="conn-title" className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="conn-title" className="text-base font-semibold">Connections</h2>
            <Link href="/network" className="text-sm text-accent">Open full network</Link>
          </div>
          <NetworkGraph nodes={ego.nodes} links={ego.links} height={300} compact focusId={vault} />
        </section>
      )}

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
    </div>
  );
}
