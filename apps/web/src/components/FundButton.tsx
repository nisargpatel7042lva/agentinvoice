"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { Check } from "lucide-react";
import { contracts, formatAmountUnits, invoiceMarketAbi, isDeployed, settlementTokenAbi } from "@invoiceagent/shared";
import { quoteHbarForUsdc } from "@/app/actions";
import { toast } from "@/components/ToastHost";
import { Button } from "@/components/ui";
import { UsdcSwap } from "@/components/UsdcSwap";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/cn";
import { useChainTx } from "@/lib/useChainTx";
import { useUsdc } from "@/lib/useUsdc";
import { hederaTestnet } from "@/lib/wagmi";

/**
 * The investor's main action. Invoices settle in USDC, so funding is up to four steps, shown one at a time:
 * turn on USDC (Hedera association) -> get USDC (swap HBAR on SaucerSwap) -> approve the market for the price -> fund.
 * fund() then moves exactly `price` USDC from this wallet to the supplier.
 */
export function FundButton({ id, price, priceLabel }: { id: string; price: string; priceLabel: string }) {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { send, busy } = useChainTx();
  const usdc = useUsdc();
  const need = BigInt(price);
  const [suggestHbar, setSuggestHbar] = useState("5");
  const cls = "mt-4 w-full";

  const short = usdc.balance >= need ? 0n : need - usdc.balance;
  // Suggest how much HBAR to swap for the shortfall, from a live 1 HBAR quote plus 5% headroom.
  useEffect(() => {
    if (short === 0n) return;
    let stale = false;
    quoteHbarForUsdc((10n ** 8n).toString()).then((q) => {
      if (stale || !q.ok || !q.data) return;
      const perHbar = Number(q.data.amountOutMinimum);
      if (perHbar > 0) setSuggestHbar(String(Math.ceil((Number(short) / perHbar) * 1.05 * 100) / 100));
    });
    return () => {
      stale = true;
    };
  }, [short]);

  if (!isConnected || !address) {
    const target = connectors.find((c) => c.id !== "injected") ?? connectors[0];
    return (
      <Button size="lg" className={cls} disabled={connecting} onClick={() => target && connect({ connector: target, chainId: hederaTestnet.id })}>
        {connecting ? "Check your wallet…" : copy.wallet.connectToFund}
      </Button>
    );
  }
  if (chainId !== hederaTestnet.id) {
    return (
      <Button size="lg" variant="outline" className={cls} disabled={switching} onClick={() => switchChain({ chainId: hederaTestnet.id })}>
        {switching ? "Switching…" : "Switch to Hedera testnet to fund"}
      </Button>
    );
  }
  if (!isDeployed(contracts.invoiceMarket)) {
    return <p className="mt-4 text-sm text-ink-muted">The invoice market contract is not deployed yet.</p>;
  }

  const steps = [
    { key: "receive", label: "USDC turned on", done: usdc.canReceive !== false },
    { key: "balance", label: `${priceLabel} in your wallet`, done: short === 0n },
    { key: "approve", label: "Market approved for the price", done: usdc.allowance >= need },
  ];
  const current = steps.find((s) => !s.done)?.key ?? "fund";

  async function approve() {
    const ok = await send({ address: contracts.usdc, abi: settlementTokenAbi as never, functionName: "approve", args: [contracts.invoiceMarket, need], success: `The market may now take ${priceLabel} when you fund.` });
    if (ok) await usdc.refresh();
  }

  async function fund() {
    const ok = await send({ address: contracts.invoiceMarket, abi: invoiceMarketAbi, functionName: "fund", args: [BigInt(id)], success: `Invoice #${id} funded with ${priceLabel}. You are the holder.` });
    if (ok) await usdc.refresh();
    else toast("pending", "If funding failed, check the steps above and try again.");
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <ol className="flex flex-col gap-1.5 text-[13px]" aria-label="Steps to fund in USDC">
        {steps.map((s) => (
          <li key={s.key} className={cn("flex items-center gap-2", s.done ? "text-ink-soft" : s.key === current ? "font-medium text-ink" : "text-ink-faint")}>
            <span aria-hidden="true" className={cn("flex size-4 items-center justify-center rounded-full border", s.done ? "border-transparent bg-good text-white" : "border-line")}>
              {s.done && <Check className="size-3" />}
            </span>
            {s.label}
          </li>
        ))}
      </ol>

      {current === "receive" || current === "balance" ? (
        <div className="rounded-xl border border-line p-3">
          {current === "balance" && <p className="mb-2 text-[13px] text-ink-soft">You have {formatAmountUnits(usdc.balance)} USDC. Swap HBAR for the {formatAmountUnits(short)} USDC you still need.</p>}
          <UsdcSwap compact suggestHbar={suggestHbar} onDone={() => void usdc.refresh()} />
        </div>
      ) : current === "approve" ? (
        <Button size="lg" className="w-full" disabled={busy} onClick={approve}>
          {busy ? "Confirm in your wallet…" : `Approve ${priceLabel}`}
        </Button>
      ) : (
        <Button size="lg" className="w-full" disabled={busy} onClick={fund}>
          {busy ? "Confirm in your wallet…" : `Fund invoice for ${priceLabel}`}
        </Button>
      )}
    </div>
  );
}
