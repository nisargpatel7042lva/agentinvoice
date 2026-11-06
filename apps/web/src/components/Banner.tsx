import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Hue = "apricot" | "lemon" | "sage" | "lilac";

/** Page banner with the landing page's character: grainy pastel panel, big title, live cards on the right. */
export function Banner({ hue, eyebrow, title, sub, action, cards, className }: { hue: Hue; eyebrow?: string; title: ReactNode; sub?: ReactNode; action?: ReactNode; cards?: ReactNode; className?: string }) {
  return (
    // The pastel panel is a picture, not a surface: .pl-panel keeps light tokens inside it in both themes.
    <section className={cn("pl-panel", `pl-${hue}`, "grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:p-10", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="font-mono text-[11.5px] font-medium tracking-[0.08em] text-[#161513]/60 uppercase">{eyebrow}</p>}
        <h1 className="pl-title mt-3 text-[40px] leading-[0.98] font-medium tracking-[-0.04em] sm:text-[52px]">{title}</h1>
        {sub && <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#161513]/70">{sub}</p>}
        {action && <div className="mt-6 flex flex-wrap items-center gap-3">{action}</div>}
      </div>
      {cards && <div className="min-w-0">{cards}</div>}
    </section>
  );
}
