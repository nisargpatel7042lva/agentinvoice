"use client";

import Link from "next/link";
import type { Amount, Approval } from "@invoiceagent/shared";
import { decideApproval } from "@/app/actions";
import { useAction } from "@/components/ActionButton";
import { ApprovalCard } from "@/components/ApprovalCard";
import { buttonVariants } from "@/components/ui";

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
      {approval.state === "rejected" && (
        <Link href={`/invoice/${approval.invoiceId}`} className={buttonVariants({ variant: "outline" })}>View invoice</Link>
      )}
      {toastEl}
    </>
  );
}
