"use client";

import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { useAccount, useReadContract } from "wagmi";
import { buyerVaultAbi, contracts, formatUnits, invoiceMarketAbi, type Address, type Status } from "@invoiceagent/shared";
import { Button } from "@/components/ui";
import { useChainTx } from "@/lib/useChainTx";
import { hederaTestnet } from "@/lib/wagmi";

/**
 * Real testnet actions for one invoice, from the connected wallet. Each button appears only when the contract
 * would accept it, so people never sign a transaction that is certain to revert.
 * - accept / pay: only the buyer vault's agent (InvoiceMarket checks it is the vault; BuyerVault checks the agent)
 * - mark late / defaulted: anyone, after the due date / grace period
 * - claim: whoever has repayments waiting (the holder)
 */
export function ChainActions({ id, status, dueDate, buyerVault }: { id: string; status: Status; dueDate: number; buyerVault: Address }) {
  const { address } = useAccount();
  const { send, busy } = useChainTx();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(t);
  }, []);

  const chainId = hederaTestnet.id;
  const { data: agent } = useReadContract({ address: buyerVault, abi: buyerVaultAbi, functionName: "agent", chainId });
  const { data: grace } = useReadContract({ address: contracts.invoiceMarket, abi: invoiceMarketAbi, functionName: "gracePeriod", chainId });
  const { data: claimable, refetch } = useReadContract({
    address: contracts.invoiceMarket,
    abi: invoiceMarketAbi,
    functionName: "claimable",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: !!address },
  });

  const isAgent = !!address && typeof agent === "string" && agent.toLowerCase() === address.toLowerCase();
  const graceSecs = typeof grace === "bigint" ? Number(grace) : null;
  const owed = typeof claimable === "bigint" ? claimable : 0n;
  const market = contracts.invoiceMarket;

  const buttons: { key: string; label: string; run: () => unknown; note: string }[] = [];
  if (isAgent && status === "Pending")
    buttons.push({ key: "accept", label: "Accept as buyer agent", note: "Your wallet is this vault's agent.", run: () => send({ address: buyerVault, abi: buyerVaultAbi, functionName: "accept", args: [market, BigInt(id)], success: `Invoice #${id} accepted.` }) });
  if (isAgent && (status === "Funded" || status === "Late"))
    buttons.push({ key: "pay", label: "Pay from the buyer vault", note: "Paid from the vault's HBAR, within its daily limit.", run: () => send({ address: buyerVault, abi: buyerVaultAbi, functionName: "payInvoice", args: [market, BigInt(id), "0x"], success: `Invoice #${id} paid.` }) });
  if (status === "Funded" && now > dueDate)
    buttons.push({ key: "late", label: "Mark as late", note: "Anyone can do this after the due date.", run: () => send({ address: market, abi: invoiceMarketAbi, functionName: "markLate", args: [BigInt(id)], success: `Invoice #${id} marked late.` }) });
  if (status === "Late" && graceSecs !== null && now > dueDate + graceSecs)
    buttons.push({ key: "default", label: "Mark as defaulted", note: "Anyone can do this after the grace period.", run: () => send({ address: market, abi: invoiceMarketAbi, functionName: "markDefaulted", args: [BigInt(id)], success: `Invoice #${id} marked defaulted.` }) });
  if (owed > 0n)
    buttons.push({ key: "claim", label: `Claim ${formatUnits(owed)} HBAR`, note: "Repayments waiting for your wallet (from all your invoices).", run: async () => { await send({ address: market, abi: invoiceMarketAbi, functionName: "claim", success: "Repayment claimed to your wallet." }); refetch(); } });

  if (!address || buttons.length === 0) return null;
  return (
    <section aria-labelledby="chain-title" className="rounded-xl border border-line bg-surface p-5">
      <h2 id="chain-title" className="flex items-center gap-2 text-sm font-semibold">
        <Link2 aria-hidden="true" className="size-4 text-ink-muted" />
        On-chain actions for your wallet
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {buttons.map((b) => (
          <li key={b.key} className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-ink-muted">{b.note}</span>
            <Button size="sm" variant={b.key === "claim" ? "default" : "outline"} disabled={busy} onClick={() => b.run()}>
              {busy ? "Working…" : b.label}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
