"use client";

import type { Amount, Approval } from "@agentinvoice/shared";
import { copy } from "@/lib/copy";
import { formatAmount } from "@/lib/format";
import { Card } from "./Card";

interface Props {
  approval: Approval;
  agentName: string;
  amount: Amount;
  threshold: Amount;
  onApprove?: () => void;
  onReject?: () => void;
}

export function ApprovalCard({ approval, agentName, amount, threshold, onApprove, onReject }: Props) {
  return (
    <Card>
      <p className="text-lg font-semibold">{copy.approval.summary(agentName, approval.invoiceId, formatAmount(amount))}</p>
      <p className="mt-1 text-sm text-ink-muted">{copy.approval.reason(formatAmount(threshold))}</p>
      {approval.state === "pending" && (
        <>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={onApprove} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover">
              {copy.approval.approve}
            </button>
            <button type="button" onClick={onReject} className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-canvas">
              {copy.approval.reject}
            </button>
          </div>
          <p className="mt-3 text-xs text-ink-muted">{copy.approval.worldHelp}</p>
        </>
      )}
      {approval.state === "approved" && <p className="mt-4 text-sm text-status-paid">{copy.approval.approved}</p>}
      {approval.state === "rejected" && <p className="mt-4 text-sm text-status-defaulted">{copy.approval.rejected}</p>}
      {approval.state === "expired" && <p className="mt-4 text-sm text-ink-muted">{copy.approval.expired}</p>}
    </Card>
  );
}
