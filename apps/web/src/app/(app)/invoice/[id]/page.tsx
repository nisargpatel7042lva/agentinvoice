import Link from "next/link";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { formatUnits } from "@agentinvoice/shared";
import { Card } from "@/components/ui";
import { Legend } from "@/components/charts";
import { EmptyState } from "@/components/EmptyState";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Section } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { Stepper } from "@/components/Stepper";
import { Term } from "@/components/Term";
import { TxLink } from "@/components/TxLink";
import { FundButton } from "@/components/FundButton";
import { DemoControls } from "@/components/InvoiceActions";
import { ChainActions } from "@/components/ChainActions";
import { api, isMock } from "@/lib/api";
import { loadEnsByVault } from "@/lib/agents";
import { loadCreditReport } from "@/lib/credit";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import { discountPct, formatAmount, formatDate, shortHex } from "@/lib/format";

export const dynamic = "force-dynamic";

const STEP_EVENT: Record<string, string> = { "invoice.created": "Pending", "invoice.accepted": "Open", "invoice.funded": "Funded", "invoice.paid": "Paid" };

function Row({ label, children, last }: { label: React.ReactNode; children: React.ReactNode; last?: boolean }) {
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
  if (!inv) return <EmptyState message={copy.error.notFound} action={{ label: copy.nav.backMarket, href: "/market" }} />;
  const [creditReport, ens, audit] = await Promise.all([loadCreditReport(inv.buyerVault), loadEnsByVault(inv.buyerVault), api.listAudit().catch(() => [])]);
  const agent = "agent" in ens ? ens.agent : undefined;
  const buyer = agent?.name ?? shortHex(inv.buyerVault);
  const history = audit.filter((e) => e.invoiceId === inv.id);
  const notes = Object.fromEntries(
    history.flatMap((e) => (STEP_EVENT[e.type] ? [[STEP_EVENT[e.type], formatDate(Number(e.consensusTimestamp.split(".")[0]))]] : [])),
  );
  const ret = BigInt(inv.faceAmount) - BigInt(inv.price);
  const retPct = ((Number(ret) / Number(inv.price)) * 100).toFixed(1);
  const settled = creditReport?.counts.settled ?? 0;
  const pct = (n: number) => (settled ? (n / settled) * 100 : 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/market" className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden="true" className="size-4" />
        {copy.nav.backMarket}
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] leading-9 font-semibold tracking-tight">{copy.invoice.title(inv.id)}</h1>
          <StatusBadge status={inv.status} />
        </div>
        <p className="mt-1 text-sm text-ink-muted">{copy.statusHelp[inv.status]}</p>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div>
            <div className="text-[13px] text-ink-muted">{copy.deal.youPay}</div>
            <div className="mt-1 text-[28px] leading-9 font-semibold">{formatAmount(inv.price)}</div>
          </div>
          <ArrowRight aria-hidden="true" className="size-5 text-ink-faint" />
          <div>
            <div className="text-[13px] text-ink-muted">{copy.deal.youGet} {copy.deal.on(formatDate(inv.dueDate))}</div>
            <div className="mt-1 text-[28px] leading-9 font-semibold">{formatAmount(inv.faceAmount)}</div>
          </div>
          <div className="ml-auto rounded-lg bg-status-paid-bg px-3 py-2 text-right">
            <div className="text-xs text-status-paid">{copy.deal.return}</div>
            <div className="text-lg font-semibold text-status-paid">+{formatUnits(ret)} HBAR · {retPct}%</div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-subtle pt-4 text-sm text-ink-soft">
          Buyer
          <Link href={`/agent/${inv.buyerVault}`} className="font-medium text-accent">{buyer}</Link>
          {creditReport && (
            <Link
              href={`/agent/${inv.buyerVault}`}
              className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity"
              title="View buyer credit score profile"
            >
              <span className="text-xs text-ink-muted">Credit score</span>
              <ScoreBadge band={creditReport.band} score={creditReport.score} />
            </Link>
          )}
        </div>

        {inv.status === "Open" && <FundButton id={inv.id} price={inv.price} priceLabel={formatAmount(inv.price)} />}
      </Card>

      {isMock ? <DemoControls id={inv.id} status={inv.status} /> : <ChainActions id={inv.id} status={inv.status} dueDate={inv.dueDate} buyerVault={inv.buyerVault} />}

      <Card className="px-6 py-5">
        <Stepper status={inv.status} notes={notes} />
      </Card>

      <Section title={copy.sections.people} hint={`Supplier, ${buyer}, sponsor and holder`}>
        <dl className="m-0">
          <Row label={copy.invoice.supplier}><TxLink address={inv.supplier} /></Row>
          <Row label={<Term explain="agent">Buyer agent</Term>}><Link href={`/agent/${inv.buyerVault}`} className="font-medium text-accent">{buyer}</Link></Row>
          <Row label={<Term explain="sponsor">Sponsor</Term>}>{agent ? "Listed on the buyer's ENS name" : <span className="text-ink-muted">Unknown</span>}</Row>
          <Row label={copy.invoice.holder} last>{inv.holder ? <TxLink address={inv.holder} /> : <span className="text-ink-muted">{copy.invoice.holderNone}</span>}</Row>
        </dl>
      </Section>

      <Section
        title={copy.sections.record}
        hint={
          creditReport
            ? `${creditReport.counts.onTime} paid on time, ${creditReport.counts.paidLate} late, ${creditReport.counts.defaulted} defaulted`
            : copy.scoreHelp.New
        }
      >
        {!creditReport || settled === 0 ? (
          <p className="text-sm text-ink-muted">{copy.scoreHelp.New}</p>
        ) : (
          <>
            <div
              role="img"
              aria-label={`${creditReport.counts.onTime} on time, ${creditReport.counts.late + creditReport.counts.paidLate} late, ${creditReport.counts.defaulted} defaulted`}
              className="flex h-3 overflow-hidden rounded-full bg-subtle"
            >
              <div className="bg-accent" style={{ width: `${pct(creditReport.counts.onTime)}%` }} />
              <div className="bg-warn" style={{ width: `${pct(creditReport.counts.late + creditReport.counts.paidLate)}%` }} />
              <div className="bg-danger" style={{ width: `${pct(creditReport.counts.defaulted)}%` }} />
            </div>
            <div className="mt-3">
              <Legend
                items={[
                  { label: `On time · ${creditReport.counts.onTime}`, color: "accent" },
                  { label: `Late · ${creditReport.counts.late + creditReport.counts.paidLate}`, color: "warn" },
                  { label: `Defaulted · ${creditReport.counts.defaulted}`, color: "danger" },
                ]}
              />
            </div>
          </>
        )}
      </Section>

      <Section title={copy.sections.money} hint="Contract and wallet addresses you can check yourself">
        <dl className="m-0">
          <Row label={copy.invoice.face}>{formatAmount(inv.faceAmount)}</Row>
          <Row label={copy.invoice.discount}>{discountPct(inv)}</Row>
          <Row label="Buyer vault"><TxLink address={inv.buyerVault} /></Row>
          {inv.bond && <Row label={copy.invoice.bond}><TxLink address={inv.bond} /></Row>}
          <Row label={copy.invoice.evidence} last><span title={copy.invoice.evidenceHelp} className="font-mono text-xs text-ink-soft">{shortHex(inv.evidenceHash)}</span></Row>
        </dl>
      </Section>

      <Section title={copy.sections.activity} hint={history.length ? `${history.length} events on the public log` : copy.empty.history}>
        {history.length === 0 ? (
          <p className="text-sm text-ink-muted">{copy.empty.history}</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {history.map((e) => (
              <li key={e.sequenceNumber} className="flex gap-3">
                <span aria-hidden="true" className="mt-1.5 size-2 flex-none rounded-full bg-accent" />
                <div>
                  <div className="text-sm font-medium">{e.type}</div>
                  <div className="text-xs text-ink-muted">HCS {e.topicId} · seq #{e.sequenceNumber}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
