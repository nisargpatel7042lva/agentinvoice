import Link from "next/link";
import type { Invoice, ScoreBand } from "@invoiceagent/shared";
import { copy } from "@/lib/copy";
import { discountPct, formatAmount, formatDate } from "@/lib/format";
import { ScoreBadge } from "./ScoreBadge";
import { StatusBadge } from "./StatusBadge";

interface Props {
  invoice: Invoice;
  buyerName?: string;
  sponsorName?: string;
  band?: ScoreBand;
  score?: number | null;
  href?: string;
}

export function InvoiceCard({ invoice, buyerName, sponsorName, band, score, href }: Props) {
  const body = (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{copy.invoice.title(invoice.id)}</span>
        <StatusBadge status={invoice.status} />
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {buyerName ?? invoice.buyerVault}
        {sponsorName ? ` · ${sponsorName}` : ""}
      </p>
      <div className="mt-3 flex items-end justify-between text-sm">
        <div>
          <div className="text-xl font-semibold">{formatAmount(invoice.price)}</div>
          <div className="text-ink-muted">
            {copy.invoice.face} {formatAmount(invoice.faceAmount)} · {discountPct(invoice)} · {formatDate(invoice.dueDate)}
          </div>
        </div>
        {band && <ScoreBadge band={band} score={score} />}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
