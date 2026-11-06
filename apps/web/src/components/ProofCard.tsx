import type { Invoice } from "@agentinvoice/shared";
import { Card } from "@/components/ui";
import { TxLink } from "@/components/TxLink";
import { formatAmount, formatDate } from "@/lib/format";

/** Proof of the claim: a Hedera Tokenize (ATS) bond token issued to the investor who funded the invoice. */
export function ProofCard({ inv }: { inv: Invoice }) {
  if (!["Funded", "Late", "Paid", "Defaulted"].includes(inv.status) || !inv.holder) return null;
  const closing =
    inv.status === "Paid" ? "Repaid. The bond units are redeemed and the holder can claim the money."
    : inv.status === "Defaulted" ? "Defaulted. The holder's bond units are frozen while the claim is sorted out."
    : `Whoever holds these units is owed ${formatAmount(inv.faceAmount)} on ${formatDate(inv.dueDate)}.`;
  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold">Proof of ownership</h2>
      <p className="mt-1 text-sm text-ink-soft">{closing}</p>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-ink-muted">Owed to</dt><dd className="m-0"><TxLink address={inv.holder} /></dd></div>
        <div className="flex justify-between gap-4"><dt className="text-ink-muted">Bond units</dt><dd className="m-0">{formatAmount(inv.faceAmount)} (1 unit per tinybar of face value)</dd></div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Bond token</dt>
          <dd className="m-0">{inv.bond ? <TxLink address={inv.bond} /> : <span className="text-ink-muted">Being issued on Hedera…</span>}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-ink-muted">The token is a record on Hedera Asset Tokenization Studio. The money itself is paid by the market contract to the holder above.</p>
    </Card>
  );
}
