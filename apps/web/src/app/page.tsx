import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { InvoiceCard } from "@/components/InvoiceCard";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { loadScore } from "@/lib/agents";
import { copy } from "@/lib/copy";
import { discountPct, formatAmount, formatDate, shortHex } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const invoices = await api.listInvoices().catch(() => null);
  if (!invoices) return <EmptyState message={copy.error.backendDown} />;
  const bands = new Map(
    await Promise.all(invoices.map(async (i) => [i.id, (await loadScore(i.buyerVault))?.band] as const)),
  );
  const c = copy.market.col;

  return (
    <div>
      <h1 className="text-2xl font-semibold">{copy.market.title}</h1>
      <p className="mt-1 text-ink-muted">{copy.market.subtitle}</p>

      {invoices.length === 0 ? (
        <div className="mt-6"><EmptyState message={copy.empty.market} /></div>
      ) : (
        <>
          <table className="mt-6 hidden w-full overflow-hidden rounded-lg border border-line bg-surface text-sm shadow-card md:table">
            <thead className="bg-canvas text-left text-xs text-ink-muted">
              <tr>
                {[c.invoice, c.buyer, c.face, c.price, copy.invoice.discount, c.due, c.score, c.status].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const band = bands.get(inv.id);
                return (
                  <tr key={inv.id} className="border-t border-line hover:bg-accent-soft">
                    <td className="px-4 py-3"><Link href={`/invoice/${inv.id}`} className="font-medium text-accent">#{inv.id}</Link></td>
                    <td className="px-4 py-3"><Link href={`/agent/${inv.buyerVault}`} className="font-mono">{shortHex(inv.buyerVault)}</Link></td>
                    <td className="px-4 py-3">{formatAmount(inv.faceAmount)}</td>
                    <td className="px-4 py-3 font-semibold">{formatAmount(inv.price)}</td>
                    <td className="px-4 py-3">{discountPct(inv)}</td>
                    <td className="px-4 py-3">{formatDate(inv.dueDate)}</td>
                    <td className="px-4 py-3">{band && <ScoreBadge band={band} />}</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-6 grid gap-4 md:hidden">
            {invoices.map((inv) => (
              <InvoiceCard key={inv.id} invoice={inv} band={bands.get(inv.id)} href={`/invoice/${inv.id}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
