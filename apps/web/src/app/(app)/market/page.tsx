import Link from "next/link";
import { ArrowDown, Plus } from "lucide-react";
import { formatUnits } from "@invoiceagent/shared";
import { Banner } from "@/components/Banner";
import { BestReturns } from "@/components/BestReturns";
import { CountUp } from "@/components/CountUp";
import { FaceByStatusChart } from "@/components/charts";
import { EmptyState } from "@/components/EmptyState";
import { HowItWorks } from "@/components/HowItWorks";
import { Section } from "@/components/Section";
import { MarketTable, type MarketRow } from "@/components/MarketTable";
import { buttonVariants } from "@/components/ui";
import { api } from "@/lib/api";
import { loadEnsByVault, registeredNames } from "@/lib/agents";
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
        const [creditReport, ens, names] = await Promise.all([loadCreditReport(v), loadEnsByVault(v), registeredNames()]);
        return [v, { creditReport, name: ("agent" in ens ? ens.agent?.name : undefined) ?? names.get(v) }] as const;
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

  const hb = (x: bigint) => Number(formatUnits(x));
  const d = (n: number) => ({ ["--d" as string]: n + "s" });

  return (
    <div className="flex flex-col gap-8">
      <Banner
        hue="apricot"
        eyebrow="Marketplace"
        title={
          <>
            Fund invoices
            <br />
            <em>before they&apos;re due.</em>
          </>
        }
        sub={copy.market.subtitle}
        action={
          <>
            <a href="#market" className={buttonVariants({ size: "lg" })}>
              Browse invoices
              <ArrowDown aria-hidden="true" />
            </a>
            <Link href="/supplier" className={buttonVariants({ variant: "ghost", size: "lg", className: "text-[#161513] hover:bg-white/40" })}>
              <Plus aria-hidden="true" />
              {copy.nav.supplier}
            </Link>
          </>
        }
        cards={
          <div className="grid grid-cols-2 gap-3">
            <div className="pl-card pl-coral flex flex-col gap-1.5" style={d(0.1)}>
              <span className="pl-k">Ready to fund</span>
              <span className="pl-big">
                <CountUp value={s.openCount} /> {s.openCount === 1 ? "invoice" : "invoices"}
              </span>
              <span className="pl-chip">{formatAmount(s.openFace.toString())} face value</span>
            </div>
            <div className="pl-card pl-dark flex flex-col gap-1 sm:translate-y-5" style={d(0.25)}>
              <span className="pl-k">Repaid on time</span>
              <span className="pl-serif text-[44px] leading-none">{s.onTimePct == null ? "—" : <CountUp value={Math.round(s.onTimePct)} suffix="%" />}</span>
              <span className="text-xs text-white/60">Of {s.settledCount} settled invoices</span>
            </div>
            <div className="pl-card pl-glass col-span-2 grid grid-cols-2 gap-3" style={d(0.4)}>
              <span>
                <span className="pl-k block">Average discount</span>
                <span className="mt-1 block text-xl font-semibold">{s.avgDiscountPct == null ? "—" : <CountUp value={s.avgDiscountPct} decimals={1} suffix="%" />}</span>
              </span>
              <span>
                <span className="pl-k block">Funded so far</span>
                <span className="mt-1 block text-xl font-semibold">
                  <CountUp value={hb(s.fundedVolume)} decimals={1} suffix=" HBAR" />
                </span>
              </span>
            </div>
          </div>
        }
      />

      <BestReturns rows={rows} />

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
