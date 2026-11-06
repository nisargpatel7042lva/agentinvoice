import type { Status } from "@agentinvoice/shared";
import { copy } from "@/lib/copy";

const styles: Record<Status, string> = {
  Pending: "text-status-pending bg-status-pending-bg",
  Open: "text-status-open bg-status-open-bg",
  Funded: "text-status-funded bg-status-funded-bg",
  Paid: "text-status-paid bg-status-paid-bg",
  Late: "text-status-late bg-status-late-bg",
  Defaulted: "text-status-defaulted bg-status-defaulted-bg",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span title={copy.statusHelp[status]} className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}
