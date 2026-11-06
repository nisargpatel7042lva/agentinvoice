import type { DualPartyCibilScore } from "@agentinvoice/shared";
import { CibilBadge } from "./CibilBadge";
import { Card } from "./ui";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export function CibilAssessment({ cibil }: { cibil: DualPartyCibilScore }) {
  const { supplier, buyer, investmentGrade, riskRecommendation, recommendedDiscountBps } = cibil;

  const getRecommendationIcon = () => {
    switch (riskRecommendation) {
      case "Strong Buy":
      case "Moderate Buy":
        return <CheckCircle2 className="size-5 text-emerald-600" />;
      case "High Risk / Caution":
        return <AlertTriangle className="size-5 text-amber-600" />;
      case "Reject":
        return <XCircle className="size-5 text-rose-600" />;
    }
  };

  const getRecommendationStyle = () => {
    switch (riskRecommendation) {
      case "Strong Buy":
        return "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
      case "Moderate Buy":
        return "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800";
      case "High Risk / Caution":
        return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
      case "Reject":
        return "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Investment Grade Banner */}
      <div className={`flex items-center justify-between rounded-lg border p-4 ${getRecommendationStyle()}`}>
        <div className="flex items-center gap-3">
          {getRecommendationIcon()}
          <div>
            <div className="font-semibold text-sm">
              Investor Recommendation: {riskRecommendation}
            </div>
            <div className="text-xs opacity-85">
              {investmentGrade
                ? "Both parties meet verifiable on-chain credit criteria."
                : "Elevated credit or fraud risk detected on one or both parties."}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs opacity-75">Target Spread</div>
          <div className="font-mono text-sm font-bold">{(recommendedDiscountBps / 100).toFixed(1)}%</div>
        </div>
      </div>

      {/* Side-by-Side Dual Credit Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Supplier Score Card */}
        <Card className="p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
              Supplier (Business) CIBIL
            </span>
            <CibilBadge tier={supplier.tier} score={supplier.score} />
          </div>
          <div className="text-xs text-ink-muted mt-1">{supplier.summary}</div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-subtle pt-3 text-center">
            <div>
              <div className="text-[11px] text-ink-muted">Acceptance</div>
              <div className="text-sm font-semibold">{supplier.acceptanceRate ?? 100}%</div>
            </div>
            <div>
              <div className="text-[11px] text-ink-muted">Invoices</div>
              <div className="text-sm font-semibold">{supplier.totalInvoices}</div>
            </div>
            <div>
              <div className="text-[11px] text-ink-muted">Defaulted</div>
              <div className={`text-sm font-semibold ${supplier.defaultedInvoices > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {supplier.defaultedInvoices}
              </div>
            </div>
          </div>
        </Card>

        {/* Buyer Score Card */}
        <Card className="p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
              Buyer (AI Vault) CIBIL
            </span>
            <CibilBadge tier={buyer.tier} score={buyer.score} />
          </div>
          <div className="text-xs text-ink-muted mt-1">{buyer.summary}</div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-subtle pt-3 text-center">
            <div>
              <div className="text-[11px] text-ink-muted">On-Time</div>
              <div className="text-sm font-semibold">{buyer.onTimeRate ?? 100}%</div>
            </div>
            <div>
              <div className="text-[11px] text-ink-muted">Settled</div>
              <div className="text-sm font-semibold">{buyer.settledInvoices}</div>
            </div>
            <div>
              <div className="text-[11px] text-ink-muted">Defaulted</div>
              <div className={`text-sm font-semibold ${buyer.defaultedInvoices > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {buyer.defaultedInvoices}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
