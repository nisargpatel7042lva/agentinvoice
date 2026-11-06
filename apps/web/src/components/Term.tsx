import { CircleHelp } from "lucide-react";
import { copy } from "@/lib/copy";

/** A word with a plain-English explanation on hover or focus, so jargon never blocks a new user. */
export function Term({ children, explain }: { children: React.ReactNode; explain: keyof typeof copy.glossary }) {
  const text = copy.glossary[explain];
  return (
    <span className="group relative inline-flex items-center gap-1">
      {children}
      <button type="button" aria-label={`What is this? ${text}`} className="text-ink-faint hover:text-ink-muted focus-visible:text-ink-muted">
        <CircleHelp aria-hidden="true" className="size-3.5" />
      </button>
      <span role="tooltip" className="pointer-events-none absolute top-full left-0 z-10 mt-1.5 hidden w-64 rounded-lg border border-line bg-surface p-3 text-xs font-normal text-ink-soft shadow-raised group-focus-within:block group-hover:block">
        {text}
      </span>
    </span>
  );
}
