import type { Hash32 } from "@invoiceagent/shared";
import { copy } from "@/lib/copy";
import { TxLink } from "./TxLink";

const border = { pending: "border-line", success: "border-status-paid", error: "border-danger" } as const;

export function Toast({ kind, message, txHash }: { kind: "pending" | "success" | "error"; message: string; txHash?: Hash32 }) {
  return (
    <div role="status" className={`pointer-events-auto max-w-sm rounded-lg border border-line border-l-4 bg-surface p-4 text-sm text-ink shadow-raised ${border[kind]}`}>
      <p>{message}</p>
      {kind === "success" && txHash && (
        <p className="mt-1">
          <TxLink hash={txHash} label={copy.toast.viewTx} />
        </p>
      )}
    </div>
  );
}
