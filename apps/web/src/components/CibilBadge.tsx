import type { CibilTier } from "@agentinvoice/shared";
import { copy } from "@/lib/copy";

const styles: Record<CibilTier, string> = {
  Excellent: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  Good: "text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800",
  Fair: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  Poor: "text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
  New: "text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
};

export function CibilBadge({
  tier,
  score,
  label,
}: {
  tier: CibilTier;
  score?: number | null;
  label?: string;
}) {
  const displayScore = score && score > 0 ? `${score}` : "New";
  const tooltip = copy.cibilHelp[tier] ?? "";

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-semibold ${styles[tier]}`}
    >
      {label && <span className="opacity-75 font-normal">{label}:</span>}
      <span>{displayScore}</span>
      <span className="text-[10px] opacity-80 uppercase tracking-wider font-mono">({tier})</span>
    </span>
  );
}

