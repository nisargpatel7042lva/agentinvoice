"use client";

import Link from "next/link";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import type { Status } from "@invoiceagent/shared";
import { acceptInvoice, markDefaulted, markLate, payInvoice, resetDemo } from "@/app/actions";
import { ActionButton } from "@/components/ActionButton";
import { buttonVariants } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * TEMPORARY demo controls: act as the buyer agent and the clock until the real agents run.
 * Shown only in mock mode, so they never reach production.
 */
export function DemoControls({ id, status }: { id: string; status: Status }) {
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const none = status === "Paid" || status === "Defaulted" || status === "Open";
  return (
    <section aria-labelledby="demo-title" className="rounded-xl border border-dashed border-line bg-subtle p-5">
      <h2 id="demo-title" className="flex items-center gap-2 text-sm font-semibold">
        <FlaskConical aria-hidden="true" className="size-4 text-ink-muted" />
        Demo controls
      </h2>
      <p className="mt-1 text-xs text-ink-muted">Temporary: act as the buyer agent until the real agents are running. Only visible in demo mode.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {status === "Pending" && <ActionButton action={() => acceptInvoice(id)} variant="outline" size="sm">Accept as buyer</ActionButton>}
        {(status === "Funded" || status === "Late") && (
          <ActionButton action={() => payInvoice(id)} after={(r) => r.ok && r.data?.approvalId && setApprovalId(r.data.approvalId)} variant="outline" size="sm">
            Pay as buyer
          </ActionButton>
        )}
        {status === "Funded" && <ActionButton action={() => markLate(id)} variant="outline" size="sm">Mark late (due date passed)</ActionButton>}
        {status === "Late" && <ActionButton action={() => markDefaulted(id)} variant="outline" size="sm">Mark defaulted</ActionButton>}
        <ActionButton action={resetDemo} variant="ghost" size="sm">Reset demo data</ActionButton>
      </div>
      {none && <p className="mt-2 text-xs text-ink-muted">{status === "Open" ? "Waiting for an investor to fund it." : "Nothing left to do for this invoice."}</p>}
      {approvalId && (
        <Link href={`/approval/${approvalId}`} className={cn(buttonVariants({ size: "sm" }), "mt-3")}>
          Open the sponsor approval
        </Link>
      )}
    </section>
  );
}
