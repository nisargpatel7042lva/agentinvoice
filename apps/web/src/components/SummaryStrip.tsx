import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Kpi = { label: string; value: ReactNode; sub?: string; tone?: "warn" };

/** A row of key figures in one bordered strip (not a card per number), like a bank's account summary. */
export function SummaryStrip({ items, label }: { items: Kpi[]; label: string }) {
  const n = items.length;
  return (
    <dl aria-label={label} className={cn("grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface", n === 3 ? "md:grid-cols-3" : "md:grid-cols-4")}>
      {items.map((k, i) => (
        <div
          key={k.label}
          className={cn(
            "px-5 py-4",
            i % 2 === 1 && "border-l border-line",
            i >= 2 && "border-t border-line md:border-t-0",
            i >= 2 && i % 2 === 0 && "md:border-l",
            n === 3 && i === 2 && "col-span-2 md:col-span-1",
          )}
        >
          <dt className="text-[13px] text-ink-muted">{k.label}</dt>
          <dd className={cn("mt-1 text-2xl font-semibold tracking-[-0.02em]", k.tone === "warn" ? "text-status-late" : "text-ink")}>{k.value}</dd>
          {k.sub && <dd className="mt-0.5 text-xs text-ink-muted">{k.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
