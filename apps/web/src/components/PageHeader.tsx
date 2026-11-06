import type { ReactNode } from "react";

/** Same header on every app page: title on the left, the page's one primary action on the right. */
export function PageHeader({ title, sub, action, children }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="text-[30px] leading-9 font-semibold tracking-[-0.025em] text-ink">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-muted">{sub}</p>}
        {children}
      </div>
      {action && <div className="flex flex-none items-center gap-2">{action}</div>}
    </div>
  );
}
