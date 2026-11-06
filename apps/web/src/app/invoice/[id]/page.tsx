import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { formatUnits } from "@agentinvoice/shared";
import { Card, CardContent, CardHeader, CardTitle, Badge, buttonVariants } from "@/components/ui";
import { Legend } from "@/components/charts";
import { EmptyState } from "@/components/EmptyState";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { Stepper } from "@/components/Stepper";
import { TxLink } from "@/components/TxLink";
import { api } from "@/lib/api";
import { loadEnsByVault, loadScore } from "@/lib/agents";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import { discountPct, formatAmount, formatDate, shortHex } from "@/lib/format";

export const dynamic = "force-dynamic";

const STEP_EVENT: Record<string, string> = { "invoice.created": "Pending", "invoice.accepted": "Open", "invoice.funded": "Funded", "invoice.paid": "Paid" };

function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-3 text-sm", !last && "border-b border-subtle")}>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="m-0 text-right">{children}</dd>
    </div>
  );
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await api.getInvoice(id).catch(() => null);
  if (!inv) return <EmptyState message={copy.error.notFound} action={{ label: copy.nav.backMarket, href: "/" }} />;
  const [score, ens, audit] = await Promise.all([loadScore(inv.buyerVault), loadEnsByVault(inv.buyerVault), api.listAudit().catch(() => [])]);
  const agent = "agent" in ens ? ens.agent : undefined;
  const history = audit.filter((e) => e.invoiceId === inv.id);
  const notes = Object.fromEntries(
    history.flatMap((e) => (STEP_EVENT[e.type] ? [[STEP_EVENT[e.type], formatDate(Number(e.consensusTimestamp.split(".")[0]))]] : [])),
  );
  const ret = BigInt(inv.faceAmount) - BigInt(inv.price);
  const retPct = ((Number(ret) / Number(inv.price)) * 100).toFixed(1);
  const settled = score ? score.paid + score.late + score.defaulted : 0;
  const pct = (n: number) => (settled ? (n / settled) * 100 : 0);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/" className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden="true" className="size-4" />
        {copy.nav.backMarket}
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] leading-9 font-semibold tracking-tight">{copy.invoice.title(inv.id)}</h1>
        <StatusBadge status={inv.status} />
        <span className="text-sm text-ink-muted">{copy.statusHelp[inv.status]}</span>
      </div>

      <Card className="px-6 py-5">
        <Stepper status={inv.status} notes={notes} />
      </Card>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <Card>
            <CardHeader><CardTitle>Amounts</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                [copy.invoice.face, formatAmount(inv.faceAmount), ""],
                [copy.invoice.price, formatAmount(inv.price), "text-accent"],
                [copy.invoice.discount, discountPct(inv), ""],
                [copy.invoice.due, formatDate(inv.dueDate), ""],
              ].map(([label, value, cls]) => (
                <div key={label}>
                  <div className="text-[13px] text-ink-muted">{label}</div>
                  <div className={cn("mt-1.5 text-xl font-semibold", cls)}>{value}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Parties</CardTitle></CardHeader>
            <CardContent className="pt-1">
              <dl className="m-0">
                <Row label={copy.invoice.supplier}><TxLink address={inv.supplier} /></Row>
                <Row label={copy.invoice.buyer}>
                  <span className="inline-flex items-center gap-2">
                    <Link href={`/agent/${inv.buyerVault}`} className="font-medium text-accent">{agent?.name ?? shortHex(inv.buyerVault)}</Link>
                    {score && <ScoreBadge band={score.band} value={score.band === "New" ? null : score.onTimeRate} />}
                  </span>
                </Row>
                <Row label={copy.sponsor.accountable}>
                  {agent ? <Badge className="bg-accent-soft font-medium text-accent">Listed on ENS</Badge> : <span className="text-ink-muted">Unknown</span>}
                </Row>
                <Row label={copy.invoice.holder} last>{inv.holder ? <TxLink address={inv.holder} /> : <span className="text-ink-muted">{copy.invoice.holderNone}</span>}</Row>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{copy.invoice.history}</CardTitle></CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-ink-muted">{copy.empty.history}</p>
              ) : (
                <ol className="flex flex-col gap-4">
                  {history.map((e) => (
                    <li key={e.sequenceNumber} className="flex gap-3">
                      <span aria-hidden="true" className="mt-1.5 size-2 flex-none rounded-full bg-accent" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{e.type}</div>
                        <div className="text-xs text-ink-muted">HCS {e.topicId} · seq #{e.sequenceNumber}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <Card>
            <CardHeader><CardTitle>Fund this invoice</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="m-0 flex flex-col gap-2.5 text-sm">
                <div className="flex justify-between"><dt className="text-ink-muted">You pay now</dt><dd className="m-0 font-semibold">{formatAmount(inv.price)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-muted">You receive on {formatDate(inv.dueDate)}</dt><dd className="m-0 font-semibold">{formatAmount(inv.faceAmount)}</dd></div>
                <div className="flex justify-between border-t border-subtle pt-2.5"><dt className="text-ink-muted">Return</dt><dd className="m-0 font-semibold text-status-paid">+{formatUnits(ret)} HBAR ({retPct}%)</dd></div>
              </dl>
              {inv.status === "Open" ? (
                <button type="button" disabled className={buttonVariants({ size: "lg" })}>{copy.wallet.connectToFund}</button>
              ) : (
                <p className="rounded-lg bg-subtle px-3 py-2 text-sm text-ink-soft">{copy.statusHelp[inv.status]}</p>
              )}
              <p className="text-xs text-ink-muted">Repayment goes to the wallet recorded as holder when you fund.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Buyer repayment record</CardTitle>
              {score && <span className="text-xs text-ink-muted">{settled} settled invoices</span>}
            </CardHeader>
            <CardContent>
              {!score || settled === 0 ? (
                <p className="text-sm text-ink-muted">{copy.scoreHelp.New}</p>
              ) : (
                <>
                  <div role="img" aria-label={`${score.paid} on time, ${score.late} late, ${score.defaulted} defaulted`} className="flex h-3 overflow-hidden rounded-full bg-subtle">
                    <div className="bg-accent" style={{ width: `${pct(score.paid)}%` }} />
                    <div className="bg-warn" style={{ width: `${pct(score.late)}%` }} />
                    <div className="bg-danger" style={{ width: `${pct(score.defaulted)}%` }} />
                  </div>
                  <div className="mt-3">
                    <Legend items={[{ label: `On time · ${score.paid}`, color: "accent" }, { label: `Late · ${score.late}`, color: "warn" }, { label: `Defaulted · ${score.defaulted}`, color: "danger" }]} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{copy.money.where}</CardTitle></CardHeader>
            <CardContent className="pt-1">
              <dl className="m-0">
                <Row label="Buyer vault"><TxLink address={inv.buyerVault} /></Row>
                {inv.bond && <Row label={copy.invoice.bond}><TxLink address={inv.bond} /></Row>}
                <Row label={copy.invoice.evidence} last><span title={copy.invoice.evidenceHelp} className="font-mono text-xs text-ink-soft">{shortHex(inv.evidenceHash)}</span></Row>
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
