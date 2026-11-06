import Link from "next/link";
import { Card, Row } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { TxLink } from "@/components/TxLink";
import { api } from "@/lib/api";
import { loadScore } from "@/lib/agents";
import { copy } from "@/lib/copy";
import { discountPct, formatAmount, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await api.getInvoice(id).catch(() => null);
  if (!inv) return <EmptyState message={copy.error.notFound} action={{ label: copy.nav.backMarket, href: "/" }} />;
  const [score, audit] = await Promise.all([loadScore(inv.buyerVault), api.listAudit().catch(() => [])]);
  const history = audit.filter((e) => e.invoiceId === inv.id);

  return (
    <div className="grid gap-6">
      <Link href="/" className="text-sm text-accent">← {copy.nav.backMarket}</Link>
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{copy.invoice.title(inv.id)}</h1>
          <StatusBadge status={inv.status} />
        </div>
        <p className="mt-1 text-sm text-ink-muted">{copy.statusHelp[inv.status]}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={copy.invoice.price}>
          <dl>
            <Row label={copy.invoice.face}>{formatAmount(inv.faceAmount)}</Row>
            <Row label={copy.invoice.price}>{formatAmount(inv.price)}</Row>
            <Row label={copy.invoice.discount}>{discountPct(inv)}</Row>
            <Row label={copy.invoice.due}>{formatDate(inv.dueDate)}</Row>
          </dl>
        </Card>
        <Card title={copy.invoice.buyer}>
          <dl>
            <Row label={copy.invoice.supplier}><TxLink address={inv.supplier} /></Row>
            <Row label={copy.invoice.buyer}>
              <Link href={`/agent/${inv.buyerVault}`} className="text-accent">{inv.buyerVault.slice(0, 10)}…</Link>{" "}
              {score && <ScoreBadge band={score.band} value={score.value} />}
            </Row>
            <Row label={copy.invoice.holder}>{inv.holder ? <TxLink address={inv.holder} /> : copy.invoice.holderNone}</Row>
          </dl>
        </Card>
      </div>

      <Card title={copy.money.where}>
        <p className="text-sm">{inv.description}</p>
        <dl className="mt-3">
          <Row label={copy.invoice.evidence}><span className="font-mono text-xs" title={copy.invoice.evidenceHelp}>{inv.evidenceHash.slice(0, 18)}…</span></Row>
          {inv.bond && <Row label={copy.invoice.bond}><TxLink address={inv.bond} /></Row>}
        </dl>
        {inv.status === "Open" && (
          <button type="button" disabled className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white opacity-60">
            {copy.wallet.connectToFund}
          </button>
        )}
      </Card>

      <Card title={copy.invoice.history}>
        {history.length === 0 ? (
          <p className="text-sm text-ink-muted">{copy.empty.history}</p>
        ) : (
          <ul className="text-sm">
            {history.map((e) => (
              <li key={e.sequenceNumber} className="border-b border-line py-2 last:border-0">
                <span className="font-medium">{e.type}</span> <span className="text-ink-muted">#{e.sequenceNumber}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
