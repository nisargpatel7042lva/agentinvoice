import { hederaTestnet, type Address, type Hash32 } from "@invoiceagent/shared";
import { shortHex } from "@/lib/format";

export function TxLink({ hash, address, label }: { hash?: Hash32; address?: Address; label?: string }) {
  const value = hash ?? address;
  if (!value) return null;
  const href = `${hederaTestnet.explorerUrl}/${hash ? "transaction" : "address"}/${value}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-mono text-sm text-accent underline-offset-2 hover:underline">
      {label ?? shortHex(value)} ↗
    </a>
  );
}
