"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";
import { useAccount, useDeployContract, useSignMessage } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { buyerNameMessage, mintBuyerName } from "@/app/actions";
import { toast } from "@/components/ToastHost";
import { Button, Card } from "@/components/ui";
import { buyerVaultAbi, buyerVaultBytecode, contracts, parseUnits } from "@invoiceagent/shared";
import { explainTxError, useChainTx } from "@/lib/useChainTx";
import { hederaTestnet, wagmiConfig } from "@/lib/wagmi";

const input = "mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-accent";
const AGENT = process.env.NEXT_PUBLIC_AGENT_ADDRESS; // the wallet of the buyer agent that pays from the vault
const VERIFIER = process.env.NEXT_PUBLIC_VERIFIER_ADDRESS; // the World-verified approver contract or wallet

/**
 * A buyer's setup: deploy their own BuyerVault from their wallet (or paste one they already own), let it pay through the market,
 * then register its ENS name so the whole network can go from the vault to its agent.
 */
export function BuyerSetup({ parent, onDone }: { parent: string; onDone: () => void }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { deployContractAsync } = useDeployContract();
  const { send } = useChainTx();
  const [vault, setVault] = useState("");
  const [limit, setLimit] = useState("500");
  const [threshold, setThreshold] = useState("50");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<"" | "deploy" | "name">("");
  const configured = Boolean(AGENT && VERIFIER);

  async function deploy() {
    if (!address || !AGENT || !VERIFIER) return;
    let args: readonly [Address, Address, Address, bigint, bigint];
    try {
      args = [address, AGENT as Address, VERIFIER as Address, parseUnits(limit), parseUnits(threshold)];
    } catch {
      return toast("error", "Limits must be numbers like 500 or 50.5.");
    }
    setBusy("deploy");
    try {
      toast("pending", "Confirm the deployment in your wallet…");
      const hash = await deployContractAsync({ abi: buyerVaultAbi, bytecode: buyerVaultBytecode, args, chainId: hederaTestnet.id, gas: 4_000_000n });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: hederaTestnet.id });
      if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("The deployment was reverted.");
      setVault(receipt.contractAddress);
      toast("success", `Your vault is deployed at ${receipt.contractAddress}. Next, let it pay through the market.`);
      // The vault only pays markets its owner has allowed.
      const ok = await send({ address: receipt.contractAddress, abi: buyerVaultAbi, functionName: "allowMarket", args: [contracts.invoiceMarket, true], success: "The vault can now pay invoices from the market." });
      if (!ok) toast("error", "The vault is deployed but not yet allowed to pay. Press 'Allow market' to retry.");
    } catch (e) {
      toast("error", explainTxError(e));
    } finally {
      setBusy("");
    }
  }

  async function allow() {
    if (isAddress(vault)) await send({ address: vault, abi: buyerVaultAbi, functionName: "allowMarket", args: [contracts.invoiceMarket, true], success: "The vault can now pay invoices from the market." });
  }

  async function name() {
    if (!address || !isAddress(vault)) return toast("error", "Deploy a vault or paste the address of one you own.");
    setBusy("name");
    try {
      const clean = label.trim().toLowerCase();
      const msg = await buyerNameMessage(clean, address, vault);
      if (!msg.ok || !msg.data) return toast("error", msg.message);
      let signature: string;
      try {
        signature = await signMessageAsync({ message: msg.data.message });
      } catch {
        return toast("error", "Signing was cancelled. Nothing was registered.");
      }
      const r = await mintBuyerName(clean, address, vault, signature);
      toast(r.ok ? "success" : "error", r.message);
      if (r.ok) onDone();
    } catch {
      toast("error", "The registration took too long to confirm. Checking your profile now…");
      onDone();
    } finally {
      setBusy("");
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold">
        Set up your <span className="pl-serif text-accent">buyer agent</span>
      </h2>
      <p className="mt-2 max-w-xl text-sm text-ink-soft">
        Your vault holds the HBAR your agent pays invoices from, and enforces your daily limit on-chain. You own it. Then we register a public ENS name that points at it.
      </p>
      <div className="mt-4 grid max-w-xl gap-4">
        <div className="grid gap-3 rounded-xl border border-line p-4">
          <span className="text-sm font-medium">1. Your vault</span>
          {configured ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">Daily limit (HBAR)<input className={input} value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" /></label>
                <label className="block text-sm">Human approval above (HBAR)<input className={input} value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" /></label>
              </div>
              <Button className="w-fit" onClick={() => void deploy()} disabled={busy !== ""} aria-busy={busy === "deploy"}>{busy === "deploy" ? "Deploying…" : "Deploy my vault"}</Button>
            </>
          ) : (
            <p className="text-sm text-ink-muted">Deploying here is not set up (NEXT_PUBLIC_AGENT_ADDRESS and NEXT_PUBLIC_VERIFIER_ADDRESS). You can still paste a vault you already own.</p>
          )}
          <label className="block text-sm">
            Vault address
            <input className={input + " font-mono"} value={vault} onChange={(e) => setVault(e.target.value.trim())} placeholder="0x…" autoComplete="off" />
          </label>
          {isAddress(vault) && <Button variant="outline" size="sm" className="w-fit" onClick={() => void allow()}>Allow market</Button>}
        </div>
        <div className="grid gap-3 rounded-xl border border-line p-4">
          <span className="text-sm font-medium">2. Your public name</span>
          <span className="flex items-center gap-2">
            <input className={input + " mt-0"} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="acme-buyer" autoComplete="off" />
            <span className="whitespace-nowrap font-mono text-xs text-ink-muted">.{parent}</span>
          </span>
          <Button className="w-fit" onClick={() => void name()} disabled={busy !== "" || !isAddress(vault) || label.trim().length < 3} aria-busy={busy === "name"}>{busy === "name" ? "Registering on Sepolia…" : "Register my agent name"}</Button>
        </div>
      </div>
    </Card>
  );
}
