import Link from "next/link";
import { Plus } from "lucide-react";
import { FaceByStatusChart } from "@/components/charts";
import { EmptyState } from "@/components/EmptyState";
import { RoleGuide } from "@/components/RoleGuide";
import { HowItWorks } from "@/components/HowItWorks";
import { Section } from "@/components/Section";
import { MarketTable, type MarketRow } from "@/components/MarketTable";
import { buttonVariants, Card, CardContent, CardHeader, CardTitle, Progress, StatCard } from "@/components/ui";
import { api } from "@/lib/api";
import { loadEnsByVault } from "@/lib/agents";
import { loadCreditReport } from "@/lib/credit";
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
        const [creditReport, ens] = await Promise.all([loadCreditReport(v), loadEnsByVault(v)]);
        return [v, { creditReport, name: "agent" in ens ? ens.agent?.name : undefined }] as const;
      }),
    ),
  );
  const rows: MarketRow[] = invoices.map((invoice) => {
    const i = info.get(invoice.buyerVault.toLowerCase());
    return {
      invoice,
      buyerName: i?.name,
      band: i?.creditReport?.band,
      score: i?.creditReport?.score ?? null,
    };
  });
  const s = marketStats(invoices);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-semibold tracking-tight">{copy.market.title}</h1>
          <p className="mt-1.5 text-[15px] text-ink-muted">{copy.market.subtitle}</p>
          <ul aria-label="Market summary" className="mt-3 flex flex-wrap gap-2 text-[13px]">
            <li className="rounded-full border border-line bg-surface px-3 py-1 text-ink-soft">
              <span className="font-semibold text-ink">{s.openCount}</span> ready to fund
            </li>
            {s.avgDiscountPct != null && (
              <li className="rounded-full border border-line bg-surface px-3 py-1 text-ink-soft">
                Average discount <span className="font-semibold text-ink">{s.avgDiscountPct.toFixed(1)}%</span>
              </li>
            )}
            {s.onTimePct != null && (
              <li className="rounded-full border border-line bg-surface px-3 py-1 text-ink-soft">
                <span className="font-semibold text-status-paid">{Math.round(s.onTimePct)}%</span> repaid on time
              </li>
            )}
          </ul>
        </div>
        <Link href="/supplier" className={buttonVariants({ variant: "outline" })}>
          <Plus aria-hidden="true" />
          I&apos;m a supplier
        </Link>
      </div>

      <HowItWorks />

      <RoleGuide />

      <div id="market" className="scroll-mt-20">
        <MarketTable rows={rows} />
      </div>

      <Section title={copy.market.overview} hint={copy.market.overviewHint}>
      <div className="flex flex-col gap-4">
      <section className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <StatCard label="Open for funding" value={`${s.openCount} ${s.openCount === 1 ? "invoice" : "invoices"}`} sub={`${formatAmount(s.openFace.toString())} face value`} />
        <StatCard label="Average discount" value={s.avgDiscountPct == null ? "—" : `${s.avgDiscountPct.toFixed(1)}%`} sub="Across open invoices" />
        <StatCard label="Funded so far" value={formatAmount(s.fundedVolume.toString())} sub={`${s.fundedCount} invoices funded by investors`} />
        <StatCard label="Repaid on time" value={s.onTimePct == null ? "—" : `${Math.round(s.onTimePct)}%`} sub={`Of ${s.settledCount} settled invoices`}>
          {s.onTimePct != null && <Progress value={s.onTimePct} label="Share of settled invoices repaid on time" barClassName="bg-status-paid" />}
        </StatCard>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Invoice value by status</CardTitle>
          <span className="text-xs text-ink-muted">From on-chain invoices</span>
        </CardHeader>
        <CardContent>
          <FaceByStatusChart data={faceByStatus(invoices)} />
        </CardContent>
      </Card>
      </div>
      </Section>
    </div>
  );
}
