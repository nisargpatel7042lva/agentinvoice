import Link from "next/link";
import { Plus } from "lucide-react";
import { FaceByStatusChart } from "@/components/charts";
import { EmptyState } from "@/components/EmptyState";
import { MarketTable, type MarketRow } from "@/components/MarketTable";
import { buttonVariants, Card, CardContent, CardHeader, CardTitle, Progress, StatCard } from "@/components/ui";
import { api } from "@/lib/api";
import { loadEnsByVault, loadScore } from "@/lib/agents";
import { copy } from "@/lib/copy";
import { formatAmount } from "@/lib/format";
import { faceByStatus, marketStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const invoices = await api.listInvoices().catch(() => null);
  if (!invoices) return <EmptyState message={copy.error.backendDown} />;

  const vaults = [...new Set(invoices.map((i) => i.buyerVault.toLowerCase()))];
  const info = new Map(
    await Promise.all(
      vaults.map(async (v) => {
        const [score, ens] = await Promise.all([loadScore(v), loadEnsByVault(v)]);
        return [v, { score, name: "agent" in ens ? ens.agent?.name : undefined }] as const;
      }),
    ),
  );
  const rows: MarketRow[] = invoices.map((invoice) => {
    const i = info.get(invoice.buyerVault.toLowerCase());
    return { invoice, buyerName: i?.name, band: i?.score?.band, score: i?.score && i.score.band !== "New" ? i.score.onTimeRate : null };
  });
  const s = marketStats(invoices);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-semibold tracking-tight">{copy.market.title}</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">{copy.market.subtitle}</p>
        </div>
        <Link href="/supplier" className={buttonVariants()}>
          <Plus aria-hidden="true" />
          {copy.nav.supplier}
        </Link>
      </div>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <StatCard label="Open for funding" value={`${s.openCount} ${s.openCount === 1 ? "invoice" : "invoices"}`} sub={`${formatAmount(s.openFace.toString())} face value`} />
        <StatCard label="Average discount" value={s.avgDiscountPct == null ? "—" : `${s.avgDiscountPct.toFixed(1)}%`} sub="Across open invoices" />
        <StatCard label="Funded so far" value={formatAmount(s.fundedVolume.toString())} sub={`${s.fundedCount} invoices funded by investors`} />
        <StatCard label="Repaid on time" value={s.onTimePct == null ? "—" : `${Math.round(s.onTimePct)}%`} sub={`Of ${s.settledCount} settled invoices`}>
          {s.onTimePct != null && <Progress value={s.onTimePct} label="Share of settled invoices repaid on time" barClassName="bg-status-paid" />}
        </StatCard>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Face value by status</CardTitle>
          <span className="text-xs text-ink-muted">From on-chain invoices</span>
        </CardHeader>
        <CardContent>
          <FaceByStatusChart data={faceByStatus(invoices)} />
        </CardContent>
      </Card>

      <MarketTable rows={rows} />
    </div>
  );
}
