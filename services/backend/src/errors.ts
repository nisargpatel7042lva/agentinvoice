// One short line for logs. viem errors carry a multi-line message that can include whole request bodies; shortMessage is the
// readable summary. Never log the full error object: it can contain request data.
export function errorMessage(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string } | null;
  const text = e?.shortMessage ?? e?.message ?? String(err);
  return (text.split("\n")[0] ?? "").slice(0, 300);
}
