import Link from "next/link";
import { payPolicyFixture, type Address } from "@agentinvoice/shared";
import { Legend, RepaymentChart } from "@/components/charts";
import { EnsPanel, PermissionsPanel } from "@/components/EnsPanel";
import { PolicyPanel } from "@/components/PolicyPanel";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Section } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { Term } from "@/components/Term";
import { TxLink } from "@/components/TxLink";
import { Progress, StatCard, Table, TableBox, Td, Th } from "@/components/ui";
import { api, isMock } from "@/lib/api";
import { loadEnsByVault, loadScore } from "@/lib/agents";
import { copy } from "@/lib/copy";
import { formatAmount, formatDate, shortHex } from "@/lib/format";
import { repaymentsByWeek } from "@/lib/stats";

export const dynamic = "force-dynamic";

// Spent-today comes from the vault contract; mock mode shows a sample value.
const MOCK_SPENT_TODAY = "1200000000";

export default async function AgentPage({ params }: { params: Promise<{ vault: string }> }) {
  const { vault } = await params;
  const [ens, score, invoices] = await Promise.all([loadEnsByVault(vault), loadScore(vault), api.listInvoices().catch(() => [])]);
  const agent = "agent" in ens ? ens.agent : undefined;
  const mine = invoices.filter((i) => i.buyerVault.toLowerCase() === vault.toLowerCase());
  const weekly = repaymentsByWeek(mine);
  const settled = score ? score.paid + score.late + score.defaulted : 0;
  const spent = isMock ? MOCK_SPENT_TODAY : null;
  const spentPct = spent && agent ? (Number(spent) / Number(agent.limit)) * 100 : null;
  const summary = !score || settled === 0 ? "No payment history yet." : `Paid on time ${score.onTimeRate}% of the time across ${settled} invoices.`;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <section className="flex flex-wrap items-center gap-4">
        <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-[14px] bg-accent-soft text-xl font-bold text-accent">
          {(agent?.name ?? vault.slice(2)).slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-60 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] leading-9 font-semibold tracking-tight">{agent?.name ?? shortHex(vault)}</h1>
            {score && <Term explain="score"><ScoreBadge band={score.band} value={score.band === "New" ? null : score.onTimeRate} /></Term>}
          </div>
          <p className="mt-1 text-[15px] text-ink-soft">{summary}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-muted">
            <Term explain="agent">Buyer agent</Term> · pays from <TxLink address={vault as Address} />
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Paid on time" value={score && settled ? `${score.onTimeRate}%` : "—"} sub={score ? `${score.paid} on time · ${score.late} late · ${score.defaulted} defaulted` : copy.scoreHelp.New} />
        <StatCard label="Spent today" value={spent ? formatAmount(spent) : "—"} sub={agent ? `Limit ${formatAmount(agent.limit)} a day, set by the sponsor` : undefined}>
          {spentPct != null && <Progress value={spentPct} label="Share of daily limit spent today" />}
        </StatCard>
      </section>

      <EnsPanel state={ens} vaultOnChain={vault as Address} />

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

      {isMock && agent && (
        <Section title={copy.policy.title} hint="Limits the sponsor set for this agent">
          <PolicyPanel policy={payPolicyFixture} dailyLimit={agent.limit} threshold={agent.threshold} spentToday={spent ?? "0"} allowedSuppliers={3} />
        </Section>
      )}
    </div>
  );
}
