import type { Status } from "@invoiceagent/shared";
import { cn } from "@/lib/cn";

const MAIN = ["Pending", "Open", "Funded", "Paid"] as const;

/** Invoice progress. Late and Defaulted replace the last step, coloured as a warning. */
export function Stepper({ status, notes }: { status: Status; notes?: Partial<Record<string, string>> }) {
  const last = status === "Late" || status === "Defaulted" ? status : "Paid";
  const steps = [...MAIN.slice(0, 3), last];
  const reached = status === "Late" || status === "Defaulted" ? 4 : MAIN.indexOf(status as (typeof MAIN)[number]) + 1;
  return (
    <ol aria-label="Invoice progress" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {steps.map((label, i) => {
        const done = i < reached;
        const bad = done && (label === "Late" || label === "Defaulted");
        return (
          <li key={label} aria-current={i === reached - 1 ? "step" : undefined} className="flex flex-col gap-2">
            <div className={cn("h-1 rounded-full", bad ? "bg-status-late" : done ? "bg-accent" : "bg-line")} />
            <span className={cn("text-[13px] font-semibold", done ? "text-ink" : "text-ink-faint")}>{label}</span>
            {notes?.[label] && <span className="text-xs text-ink-muted">{notes[label]}</span>}
          </li>
        );
      })}
    </ol>
  );
}
