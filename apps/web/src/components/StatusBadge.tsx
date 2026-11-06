import type { Status } from "@invoiceagent/shared";
import { copy } from "@/lib/copy";

const styles: Record<Status, { pill: string; dot: string }> = {
  Pending: { pill: "text-status-pending bg-status-pending-bg", dot: "bg-status-pending" },
  Open: { pill: "text-status-open bg-status-open-bg", dot: "bg-status-open" },
  Funded: { pill: "text-status-funded bg-status-funded-bg", dot: "bg-status-funded" },
  Paid: { pill: "text-status-paid bg-status-paid-bg", dot: "bg-status-paid" },
  Late: { pill: "text-status-late bg-status-late-bg", dot: "bg-status-late" },
  Defaulted: { pill: "text-status-defaulted bg-status-defaulted-bg", dot: "bg-status-defaulted" },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = styles[status];
  return (
    <span title={copy.statusHelp[status]} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.pill}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}
