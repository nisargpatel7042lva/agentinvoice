import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ScoreBadge } from "@/components/ScoreBadge";
import type { MarketRow } from "@/components/MarketTable";
import { cn } from "@/lib/cn";
import { formatAmount, formatDate, shortHex } from "@/lib/format";

const returnPct = (r: MarketRow) => {
  const p = Number(r.invoice.price);
  return p ? ((Number(r.invoice.faceAmount) - p) / p) * 100 : 0;
};
const SKINS = ["pl-paper", "pl-coral", "pl-dark"];

/** The three open invoices with the best return, as cards you can fund in one click. */
export function BestReturns({ rows }: { rows: MarketRow[] }) {
  const top = rows
    .filter((r) => r.invoice.status === "Open")
    .sort((a, b) => returnPct(b) - returnPct(a))
    .slice(0, 3);
  if (top.length === 0) return null;
  return (
    <section aria-labelledby="best-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="best-title" className="text-lg font-semibold tracking-[-0.02em]">
          Best returns <span className="pl-serif text-accent">today</span>
        </h2>
        <a href="#market" className="text-sm text-ink-muted hover:text-ink">See all invoices</a>
      </div>
      <ul className="mt-3 grid gap-4 md:grid-cols-3">
        {top.map((r, i) => {
          const inv = r.invoice;
          const dark = SKINS[i] === "pl-dark";
          return (
            <li key={inv.id}>
              <Link href={"/invoice/" + inv.id} className={cn("pl-card pl-lift flex h-full flex-col gap-4 p-5", SKINS[i])} style={{ ["--d" as string]: 0.08 * i + "s" }}>
                <span className="flex items-center justify-between gap-2 font-mono text-[11.5px] tracking-[0.06em]">
                  INVOICE #{inv.id}
                  <span className={cn("pl-chip", dark && "bg-white/15 text-[#f3f1ec]")}>+{returnPct(r).toFixed(1)}%</span>
                </span>
                <span>
                  <span className="pl-big block">{formatAmount(inv.faceAmount)}</span>
                  <span className={cn("mt-1 block text-[13px]", dark ? "text-white/65" : "text-[#161513]/65")}>
                    Pay {formatAmount(inv.price)} now · back on {formatDate(inv.dueDate)}
                  </span>
                </span>
                <span className={cn("mt-auto flex items-center justify-between gap-3 border-t pt-3 text-[13px]", dark ? "border-white/15" : "border-[#161513]/15")}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{r.buyerName ?? shortHex(inv.buyerVault)}</span>
                    {r.band && <ScoreBadge band={r.band} score={r.score} />}
                  </span>
                  <span className="inline-flex flex-none items-center gap-1 font-semibold">
                    Fund <ArrowRight aria-hidden="true" className="size-3.5" />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
