import Link from "next/link";
import { Plus } from "lucide-react";
import { FaceByStatusChart } from "@/components/charts";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { HowItWorks } from "@/components/HowItWorks";
import { Section } from "@/components/Section";
import { MarketTable, type MarketRow } from "@/components/MarketTable";
import { buttonVariants } from "@/components/ui";
import { cn } from "@/lib/cn";
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

  const kpis = [
    { label: "Ready to fund", value: `${s.openCount}`, sub: `${formatAmount(s.openFace.toString())} face value` },
    { label: "Average discount", value: s.avgDiscountPct == null ? "—" : `${s.avgDiscountPct.toFixed(1)}%`, sub: "Across open invoices" },
    { label: "Funded so far", value: formatAmount(s.fundedVolume.toString()), sub: `${s.fundedCount} invoices` },
    { label: "Repaid on time", value: s.onTimePct == null ? "—" : `${Math.round(s.onTimePct)}%`, sub: `Of ${s.settledCount} settled` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={copy.market.title}
        sub={copy.market.subtitle}
        action={
          <Link href="/supplier" className={buttonVariants({ variant: "outline" })}>
            <Plus aria-hidden="true" />
            {copy.nav.supplier}
          </Link>
        }
      />

      <dl aria-label="Market summary" className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface md:grid-cols-4">
        {kpis.map((k, i) => (
          <div key={k.label} className={cn("px-5 py-4", i % 2 === 1 && "border-l border-line", i >= 2 && "border-t border-line md:border-t-0", i === 2 && "md:border-l")}>
            <dt className="text-[13px] text-ink-muted">{k.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-ink">{k.value}</dd>
            <dd className="mt-0.5 text-xs text-ink-muted">{k.sub}</dd>
          </div>
        ))}
      </dl>

      <HowItWorks />

      <div id="market" className="scroll-mt-24">
        <MarketTable rows={rows} />
      </div>

      <Section title={copy.market.overview} hint={copy.market.overviewHint}>
        <FaceByStatusChart data={faceByStatus(invoices)} />
      </Section>
    </div>
  );
}
