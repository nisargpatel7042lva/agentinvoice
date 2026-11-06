import type { ScoreBand } from "@invoiceagent/shared";
import { copy } from "@/lib/copy";

const styles: Record<ScoreBand, string> = {
  A: "text-band-a bg-band-a-bg",
  B: "text-band-b bg-band-b-bg",
  C: "text-band-c bg-band-c-bg",
  New: "text-band-new bg-band-new-bg",
};

export function ScoreBadge({
  band,
  value,
  score,
}: {
  band: ScoreBand;
  value?: number | null;
  score?: number | null;
}) {
  let label = band as string;
  if (score !== undefined) {
    label = score != null ? `${score} · ${band}` : `— · ${band}`;
  } else if (value != null && band !== "New") {
    label = `${band} · ${value}`;
  }

  return (
    <span
      title={copy.scoreHelp[band]}
      className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${styles[band]}`}
    >
      {label}
    </span>
  );
}
