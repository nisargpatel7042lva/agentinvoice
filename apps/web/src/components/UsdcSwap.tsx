"use client";

import { useEffect, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { buildHbarToUsdcSwap, contracts, formatAmountUnits, parseUnits, settlementTokenAbi, tinybarToWeibar } from "@invoiceagent/shared";
import { quoteHbarForUsdc, type SwapQuoteView } from "@/app/actions";
import { Button } from "@/components/ui";
import { useChainTx } from "@/lib/useChainTx";
import { useUsdc } from "@/lib/useUsdc";
import { cn } from "@/lib/cn";

/**
 * Swap HBAR -> USDC on SaucerSwap from the connected wallet. Shows a live quote and swaps against it (at most 1% slippage);
 * the USDC lands in this wallet. First makes sure the wallet can receive USDC (Hedera token association).
 */
/** `recipient` sends the USDC somewhere other than this wallet, e.g. straight into a buyer vault (which is already associated). */
export function UsdcSwap({ suggestHbar = "5", onDone, compact = false, recipient }: { suggestHbar?: string; onDone?: () => void; compact?: boolean; recipient?: `0x${string}` }) {
  const usdc = useUsdc();
  const { send, sendRaw, busy } = useChainTx();
  const [hbar, setHbar] = useState(suggestHbar);
  const [quote, setQuote] = useState<SwapQuoteView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  useEffect(() => setHbar(suggestHbar), [suggestHbar]);

  // Live quote, debounced.
  useEffect(() => {
    let tinybar: bigint;
    try {
      tinybar = parseUnits(hbar.trim() || "0", 8);
    } catch {
      setQuote(null);
      setError("Enter an amount like 5 or 2.5.");
      return;
    }
    if (tinybar <= 0n) {
      setQuote(null);
      setError(null);
      return;
    }
    setQuoting(true);
    const t = setTimeout(async () => {
      const r = await quoteHbarForUsdc(tinybar.toString());
      setQuoting(false);
      if (r.ok && r.data) {
        setQuote(r.data);
        setError(null);
      } else {
        setQuote(null);
        setError(r.message);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [hbar]);

  async function turnOn() {
    const ok = await send({ address: contracts.usdc, abi: settlementTokenAbi as never, functionName: "associate", success: "USDC is turned on for this wallet." });
    if (ok) await usdc.refresh();
  }

  async function swap() {
    if (!usdc.address || !quote) return;
    if (Date.now() > quote.expiresAt) {
      setError("The quote expired. It refreshes as you type; try again.");
      return;
    }
    const tx = buildHbarToUsdcSwap({
      amountInTinybar: BigInt(quote.amountInTinybar),
      amountOutMinimum: BigInt(quote.amountOutMinimum),
      recipient: recipient ?? usdc.address,
      deadline: Math.floor(Date.now() / 1000) + 600,
    });
    const ok = await sendRaw({ to: tx.to, data: tx.data, value: tinybarToWeibar(tx.valueTinybar), success: recipient ? `Swapped ${hbar} HBAR for USDC and sent it to ${recipient.slice(0, 6)}…${recipient.slice(-4)}.` : `Swapped ${hbar} HBAR for USDC on SaucerSwap.` });
    if (ok) {
      await usdc.refresh();
      onDone?.();
    }
  }

  if (!usdc.address) return <p className="text-sm text-ink-muted">Connect a wallet to get USDC.</p>;

  if (!recipient && usdc.canReceive === false) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-soft">On Hedera a wallet has to turn on a token once before it can hold it. This is one small transaction.</p>
        <Button onClick={turnOn} disabled={busy} className="w-fit">
          {busy ? "Confirm in your wallet…" : "Turn on USDC"}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", compact && "gap-2")}>
      <label className="text-sm font-medium" htmlFor="swap-hbar">
        You pay
      </label>
      <div className="flex items-center rounded-xl border border-line bg-surface pr-3 focus-within:outline-2 focus-within:outline-accent">
        <input id="swap-hbar" inputMode="decimal" value={hbar} onChange={(e) => setHbar(e.target.value.replace(/[^0-9.]/g, ""))} className="h-12 min-w-0 flex-1 bg-transparent px-3 text-lg font-semibold outline-none" />
        <span className="text-sm font-medium text-ink-muted">HBAR</span>
      </div>
      <ArrowDown aria-hidden="true" className="mx-auto size-4 text-ink-faint" />
      <div className="flex items-center justify-between rounded-xl bg-subtle px-3 py-3">
        <span className="text-lg font-semibold">
          {quoting ? <Loader2 aria-label="Getting a quote" className="size-4 animate-spin" /> : quote ? formatAmountUnits(quote.amountOut) : "—"}
        </span>
        <span className="text-sm font-medium text-ink-muted">USDC</span>
      </div>
      <p className={cn("min-h-5 text-xs", error ? "text-danger" : "text-ink-muted")}>
        {error ?? (quote ? `At least ${formatAmountUnits(quote.amountOutMinimum)} USDC after 1% max slippage. Live SaucerSwap testnet price.` : "")}
      </p>
      <Button onClick={swap} disabled={!quote || busy || quoting}>
        {busy ? "Confirm in your wallet…" : `Swap for USDC`}
      </Button>
      <p className="text-xs text-ink-muted">Your balance: {formatAmountUnits(usdc.balance)} USDC</p>
    </div>
  );
}
