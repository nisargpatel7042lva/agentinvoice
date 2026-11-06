import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A collapsible module. Closed by default, so a screen starts with just the essentials
 * and people open more when they want it. Native <details>: keyboard and screen-reader friendly, no JS.
 */
export function Section({ title, hint, open, children, className }: { title: string; hint?: string; open?: boolean; children: ReactNode; className?: string }) {
  return (
    <details open={open} className={cn("group rounded-xl border border-line bg-surface", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-[15px] font-semibold">{title}</span>
          {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-subtle px-5 pt-4 pb-5">{children}</div>
    </details>
  );
}
