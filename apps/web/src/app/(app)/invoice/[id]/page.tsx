import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { formatUnits } from "@invoiceagent/shared";
import { Card } from "@/components/ui";
import { Legend } from "@/components/charts";
import { EmptyState } from "@/components/EmptyState";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Section } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { Stepper } from "@/components/Stepper";
import { Term } from "@/components/Term";
import { ProofCard } from "@/components/ProofCard";
import { TxLink } from "@/components/TxLink";
import { FundButton } from "@/components/FundButton";
import { ChainActions } from "@/components/ChainActions";
import { api } from "@/lib/api";
import { loadEnsByVault } from "@/lib/agents";
import { SponsorApproval } from "@/components/SponsorApproval";
import { loadCreditReport, readApprovalThreshold } from "@/lib/credit";
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
  // Above the vault threshold a human must approve before the vault pays.
  // The threshold comes from the ENS record when there is one, else straight from the vault, so a buyer without a record still gets the panel.
  const threshold = inv.status === "Funded" ? (agent?.threshold ?? (await readApprovalThreshold(inv.buyerVault))) : null;
  const needsApproval = threshold !== null && BigInt(inv.faceAmount) > BigInt(threshold);
  const approved = needsApproval ? (await api.getInvoiceApproval(inv.id).catch(() => null)) !== null : false;
  const history = audit.filter((e) => e.invoiceId === inv.id);
  const notes = Object.fromEntries(
    history.flatMap((e) => (STEP_EVENT[e.type] ? [[STEP_EVENT[e.type], formatDate(Number(e.consensusTimestamp.split(".")[0]))]] : [])),
  );
  const ret = BigInt(inv.faceAmount) - BigInt(inv.price);
  const retPct = ((Number(ret) / Number(inv.price)) * 100).toFixed(1);
  const settled = creditReport?.counts.settled ?? 0;
  const pct = (n: number) => (settled ? (n / settled) * 100 : 0);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/market" className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ChevronLeft aria-hidden="true" className="size-4" />
        {copy.nav.backMarket}
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[30px] leading-9 font-semibold tracking-[-0.025em]">{copy.invoice.title(inv.id)}</h1>
          <StatusBadge status={inv.status} />
        </div>
        <p className="mt-1.5 text-[15px] text-ink-muted">{copy.statusHelp[inv.status]}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* Summary: what you pay, what you get, and the one action. Sticky on desktop, first on phones. */}
        <aside aria-label="Deal summary" className="flex flex-col gap-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
          {needsApproval && threshold !== null && <SponsorApproval invoiceId={inv.id} amount={inv.faceAmount} threshold={threshold} approved={approved} />}
          <Card className="p-5">
            <dl className="m-0">
              <div className="flex items-baseline justify-between gap-4 pb-3">
                <dt className="text-sm text-ink-muted">{copy.deal.youPay}</dt>
                <dd className="text-2xl font-semibold tracking-[-0.02em]">{formatAmount(inv.price)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-line py-3">
                <dt className="text-sm text-ink-muted">{copy.deal.youGet} {copy.deal.on(formatDate(inv.dueDate))}</dt>
                <dd className="text-lg font-semibold">{formatAmount(inv.faceAmount)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
                <dt className="text-sm text-ink-muted">{copy.deal.return}</dt>
                <dd className="font-semibold text-status-paid">+{formatUnits(ret)} HBAR · {retPct}%</dd>
              </div>
            </dl>
            {inv.status === "Open" && <FundButton id={inv.id} price={inv.price} priceLabel={formatAmount(inv.price)} />}
            <Link href={`/agent/${inv.buyerVault}`} className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-2.5 text-sm hover:bg-line/60" title="View the buyer's credit profile">
              <span className="min-w-0">
                <span className="block text-xs text-ink-muted">Buyer</span>
                <span className="block truncate font-medium text-ink">{buyer}</span>
              </span>
              {creditReport && <ScoreBadge band={creditReport.band} score={creditReport.score} />}
            </Link>
          </Card>
          {<ChainActions id={inv.id} status={inv.status} dueDate={inv.dueDate} buyerVault={inv.buyerVault} />}
        </aside>

        <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
      <Card className="px-6 py-5">
        <Stepper status={inv.status} notes={notes} />
      </Card>

      <ProofCard inv={inv} />

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
      </div>
    </div>
  );
}
