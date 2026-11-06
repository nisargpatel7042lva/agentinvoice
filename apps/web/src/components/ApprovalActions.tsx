"use client";

import Link from "next/link";
import type { Amount, Approval } from "@agentinvoice/shared";
import { decideApproval, payInvoice } from "@/app/actions";
import { ActionButton, useAction } from "@/components/ActionButton";
import { ApprovalCard } from "@/components/ApprovalCard";
import { buttonVariants } from "@/components/ui";
import { isMock } from "@/lib/env";

export function ApprovalActions({ approval, agentName, amount, threshold }: { approval: Approval; agentName: string; amount: Amount; threshold: Amount }) {
  const { run, toastEl } = useAction();
  return (
    <>
      <ApprovalCard
        approval={approval}
        agentName={agentName}
        amount={amount}
        threshold={threshold}
        onApprove={() =>
          run(
            () => decideApproval(approval.id, true, approval.invoiceId),
            // Real mode: continue at World ID; its callback marks the approval approved.
            (r) => r.ok && r.data?.redirectUrl && window.location.assign(r.data.redirectUrl),
          )
        }
        onReject={() => run(() => decideApproval(approval.id, false, approval.invoiceId))}
      />
      {isMock && approval.state === "approved" && (
        <div className="flex flex-wrap gap-2">
          <ActionButton action={() => payInvoice(approval.invoiceId)}>Let the buyer agent pay now</ActionButton>
          <Link href={`/invoice/${approval.invoiceId}`} className={buttonVariants({ variant: "outline" })}>View invoice</Link>
        </div>
      )}
      {approval.state === "rejected" && (
        <Link href={`/invoice/${approval.invoiceId}`} className={buttonVariants({ variant: "outline" })}>View invoice</Link>
      )}
      {toastEl}
    </>
  );
}
