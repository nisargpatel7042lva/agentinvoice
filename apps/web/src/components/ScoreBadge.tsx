import type { ScoreBand } from "@agentinvoice/shared";
import { copy } from "@/lib/copy";

const styles: Record<ScoreBand, string> = {
  A: "text-band-a bg-band-a-bg",
  B: "text-band-b bg-band-b-bg",
  C: "text-band-c bg-band-c-bg",
  New: "text-band-new bg-band-new-bg",
};

export function ScoreBadge({ band, value }: { band: ScoreBand; value?: number | null }) {
  return (
    <span title={copy.scoreHelp[band]} className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${styles[band]}`}>
      {band}
      {value != null && band !== "New" ? ` · ${value}` : ""}
    </span>
  );
}
