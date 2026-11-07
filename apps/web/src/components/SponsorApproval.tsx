"use client";

import { ShieldCheck } from "lucide-react";
import { decideApproval } from "@/app/actions";
import { useAction } from "@/components/ActionButton";
import { Button, Card } from "@/components/ui";
import { formatAmount } from "@/lib/format";

/**
 * A payment above the buyer vault's threshold needs a human. The sponsor proves they are a real, freshly verified person at World ID;
 * the backend then signs the approval and the buyer agent attaches it to the payment. The vault contract refuses the payment without it.
 */
export function SponsorApproval({ invoiceId, amount, threshold, approved }: { invoiceId: string; amount: string; threshold: string; approved: boolean }) {
  const { run, pending } = useAction();
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <ShieldCheck aria-hidden="true" className="size-4 text-accent" />
        Human approval needed
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        This payment of {formatAmount(amount)} is above the buyer vault's {formatAmount(threshold)} limit for agent-only payments. The vault will not release it until a World-verified person approves.
      </p>
      {approved ? (
        <p className="mt-3 text-sm text-status-paid">Approved. The buyer agent attaches the approval and pays on its next pass.</p>
      ) : (
        <>
          <Button
            className="mt-3"
            disabled={pending}
            aria-busy={pending}
            onClick={() => run(() => decideApproval("", true, invoiceId), (r) => r.ok && r.data?.redirectUrl && window.location.assign(r.data.redirectUrl))}
          >
            {pending ? "Opening World ID…" : "Approve with World ID"}
          </Button>
          <p className="mt-2 text-xs text-ink-muted">Only the buyer's sponsor should do this. It takes a fresh Orb verification and is valid for one payment.</p>
        </>
      )}
    </Card>
  );
}
