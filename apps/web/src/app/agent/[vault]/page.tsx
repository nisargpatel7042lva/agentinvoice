import Link from "next/link";
import { payPolicyFixture, type Address } from "@agentinvoice/shared";
import { Legend, RepaymentChart } from "@/components/charts";
import { EnsPanel, PermissionsPanel } from "@/components/EnsPanel";
import { PolicyPanel } from "@/components/PolicyPanel";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { TxLink } from "@/components/TxLink";
import { Card, CardContent, CardHeader, CardTitle, Progress, StatCard, Table, TableBox, Td, Th } from "@/components/ui";
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

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-center gap-4">
        <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-[14px] bg-accent-soft text-xl font-bold text-accent">
          {(agent?.name ?? vault.slice(2)).slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-60 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] leading-9 font-semibold tracking-tight">{agent?.name ?? shortHex(vault)}</h1>
            {score && <ScoreBadge band={score.band} value={score.band === "New" ? null : score.onTimeRate} />}
            {agent && <span className="rounded-full bg-status-paid-bg px-2.5 py-0.5 text-xs font-medium text-status-paid capitalize">{agent.status}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
            Buyer agent · Vault <TxLink address={vault as Address} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <StatCard label="On-time rate" value={score && settled ? `${score.onTimeRate}%` : "—"} sub={score ? `${score.paid} paid · ${score.late} late · ${score.defaulted} defaulted` : copy.scoreHelp.New} />
        <StatCard label={copy.agent.spentToday} value={spent ? formatAmount(spent) : "—"} sub={agent ? `of ${formatAmount(agent.limit)} daily limit` : undefined}>
          {spentPct != null && <Progress value={spentPct} label="Share of daily limit spent today" />}
        </StatCard>
        <StatCard label="Open exposure" value={score ? formatAmount(score.openExposure) : "—"} sub="Funded and not yet repaid" />
        <StatCard label={copy.policy.threshold} value={agent ? formatAmount(agent.threshold) : "—"} sub="Larger payments need World ID" />
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Repayments by due week</CardTitle>
              <Legend items={[{ label: "On time", color: "accent" }, { label: "Late", color: "warn" }, { label: "Defaulted", color: "danger" }]} />
            </CardHeader>
            <CardContent>
              {weekly.length === 0 ? <p className="text-sm text-ink-muted">{copy.empty.agentHistory}</p> : <RepaymentChart data={weekly} />}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-3"><CardTitle>Invoices</CardTitle></CardHeader>
            {mine.length === 0 ? (
              <CardContent><p className="text-sm text-ink-muted">{copy.empty.agentHistory}</p></CardContent>
            ) : (
              <TableBox>
                <Table className="min-w-[520px]">
                  <thead><tr><Th className="pl-6">Invoice</Th><Th className="text-right">Face</Th><Th>Due</Th><Th className="pr-6">Status</Th></tr></thead>
                  <tbody>
                    {mine.map((i) => (
                      <tr key={i.id}>
                        <Td className="pl-6"><Link href={`/invoice/${i.id}`} className="font-mono text-[13px] text-accent">#{i.id}</Link></Td>
                        <Td className="text-right">{formatAmount(i.faceAmount)}</Td>
                        <Td className="text-ink-soft">{formatDate(i.dueDate)}</Td>
                        <Td className="pr-6"><StatusBadge status={i.status} /></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableBox>
            )}
          </Card>

          {isMock && agent && (
            <PolicyPanel policy={payPolicyFixture} dailyLimit={agent.limit} threshold={agent.threshold} spentToday={spent ?? "0"} allowedSuppliers={3} />
          )}
        </div>

        <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-5">
          <EnsPanel state={ens} vaultOnChain={vault as Address} />
          <PermissionsPanel />
        </aside>
      </div>
    </div>
  );
}
