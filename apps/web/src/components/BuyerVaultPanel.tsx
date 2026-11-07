"use client";

import { useState } from "react";
import { formatUnits, isAddress, type Address } from "viem";
import { useBalance, useReadContract } from "wagmi";
import { buyerVaultAbi, parseUnits, tinybarToWeibar } from "@invoiceagent/shared";
import { toast } from "@/components/ToastHost";
import { Button, Card } from "@/components/ui";
import { useChainTx } from "@/lib/useChainTx";
import { hederaTestnet } from "@/lib/wagmi";

const input = "mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-accent";

/** The buyer's vault controls: see the balance, put HBAR in, and say which suppliers the agent may pay and up to how much. Only the vault's owner can do these. */
export function BuyerVaultPanel({ vault }: { vault: Address }) {
  const { send, busy } = useChainTx();
  const { data: balance, refetch } = useBalance({ address: vault, chainId: hederaTestnet.id });
  const { data: limit } = useReadContract({ address: vault, abi: buyerVaultAbi, functionName: "dailyLimit", chainId: hederaTestnet.id });
  const [amount, setAmount] = useState("");
  const [supplier, setSupplier] = useState("");
  const [supplierLimit, setSupplierLimit] = useState("");

  const hbar = balance ? Number(formatUnits(balance.value, balance.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—";

  async function deposit() {
    let tiny: bigint;
    try {
      tiny = parseUnits(amount.trim());
    } catch {
      return toast("error", "Enter an amount like 50 or 12.5.");
    }
    if (tiny <= 0n) return toast("error", "Enter an amount above 0.");
    // The vault holds tinybars but the wallet sends weibar, so convert.
    const hash = await send({ address: vault, abi: buyerVaultAbi, functionName: "deposit", value: tinybarToWeibar(tiny), success: `Deposited ${amount} HBAR into your vault.` });
    if (hash) {
      setAmount("");
      setTimeout(() => void refetch(), 4000);
    }
  }

  async function allow() {
    if (!isAddress(supplier)) return toast("error", "Paste the seller's wallet address (0x…).");
    let tiny: bigint;
    try {
      tiny = parseUnits(supplierLimit.trim());
    } catch {
      return toast("error", "Enter the most the agent may pay this seller, like 100.");
    }
    if (tiny <= 0n) return toast("error", "Enter a limit above 0.");
    const hash = await send({ address: vault, abi: buyerVaultAbi, functionName: "allowSupplier", args: [supplier, tiny], success: "Your agent can now pay invoices from this seller." });
    if (hash) {
      setSupplier("");
      setSupplierLimit("");
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold">
        Your <span className="pl-serif text-accent">vault</span>
      </h2>
      <p className="mt-1 font-mono text-xs text-ink-muted">{vault}</p>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-sm">
        <span>
          <span className="text-ink-muted">Balance </span>
          <span className="font-semibold">{hbar} HBAR</span>
        </span>
        <span>
          <span className="text-ink-muted">Daily limit </span>
          <span className="font-semibold">{limit != null ? Number(formatUnits(limit as bigint, 8)).toLocaleString("en-US") : "—"} HBAR</span>
        </span>
      </div>
      <div className="mt-4 grid max-w-xl gap-4">
        <div className="grid gap-3 rounded-xl border border-line p-4">
          <span className="text-sm font-medium">Put HBAR in</span>
          <span className="flex items-center gap-2">
            <input className={input + " mt-0"} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50" />
            <Button className="shrink-0" onClick={() => void deposit()} disabled={busy || !amount.trim()}>Deposit</Button>
          </span>
        </div>
        <div className="grid gap-3 rounded-xl border border-line p-4">
          <span className="text-sm font-medium">Allow a seller</span>
          <p className="text-xs text-ink-muted">Your agent only pays sellers you allow. Without this, their invoices are skipped as "supplier is not allowed".</p>
          <input className={input + " mt-0 font-mono"} value={supplier} onChange={(e) => setSupplier(e.target.value.trim())} placeholder="Seller wallet 0x…" autoComplete="off" />
          <span className="flex items-center gap-2">
            <input className={input + " mt-0"} inputMode="decimal" value={supplierLimit} onChange={(e) => setSupplierLimit(e.target.value)} placeholder="Most per invoice, HBAR" />
            <Button className="shrink-0" onClick={() => void allow()} disabled={busy || !supplier || !supplierLimit.trim()}>Allow</Button>
          </span>
        </div>
      </div>
    </Card>
  );
}
