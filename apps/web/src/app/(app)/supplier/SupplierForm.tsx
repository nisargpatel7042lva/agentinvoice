"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import type { Hash32 } from "@invoiceagent/shared";
import { useAccount, useReadContract, useSignMessage, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { parseEventLogs } from "viem";
import { buyerVaultAbi, contracts, invoiceMarketAbi, parseUnits } from "@invoiceagent/shared";
import { createInvoice, invoiceDescriptionMessage, lookupBuyer, setInvoiceDescription } from "@/app/actions";
import { toast } from "@/components/ToastHost";
import { explainTxError } from "@/lib/useChainTx";
import { hederaTestnet, wagmiConfig } from "@/lib/wagmi";
import type { BuyerLookup } from "@/lib/ens";
import { useAction } from "@/components/ActionButton";
import { Button, Card } from "@/components/ui";
import { copy } from "@/lib/copy";
import { formatAmount, shortHex } from "@/lib/format";
import { InvoicePreview } from "./InvoicePreview";

const input = "mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-accent";
const label = "block text-sm font-medium text-ink";

async function sha256(data: ArrayBuffer): Promise<Hash32> {
  const buf = await crypto.subtle.digest("SHA-256", data);
  return `0x${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function inDays(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

export function SupplierForm({ aside }: { aside?: React.ReactNode }) {
  const router = useRouter();
  const { pending, run, toastEl } = useAction();
  const [buyer, setBuyer] = useState("");
  const [face, setFace] = useState("");
  const [price, setPrice] = useState("");
  const [due, setDue] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState<Hash32 | null>(null);
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const [mining, setMining] = useState(false);

  // The buyer is looked up live: a 0x vault address as typed, or an ENS name read from Sepolia (mock mode: the sample name).
  const typed = buyer.trim();
  const [lookup, setLookup] = useState<{ for: string; result: BuyerLookup | "loading" }>({ for: "", result: "loading" });
  useEffect(() => {
    if (!typed) return;
    let stale = false;
    const t = setTimeout(() => {
      lookupBuyer(typed).then(
        (result) => !stale && setLookup({ for: typed, result }),
        () => !stale && setLookup({ for: typed, result: { kind: "unreachable" } }),
      );
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [typed]);
  const current = lookup.for === typed ? lookup.result : "loading";
  const resolved = current !== "loading" && current.kind === "ok" ? { vault: current.vault, status: current.agent?.status, limit: current.agent?.limit } : null;
  // The buyer's vault only lets its agent pay sellers the buyer has allowed, so say so before the seller waits for nothing.
  const { data: allowed } = useReadContract({
    address: resolved?.vault as `0x${string}` | undefined,
    abi: buyerVaultAbi,
    functionName: "allowedSupplier",
    args: address ? [address] : undefined,
    chainId: hederaTestnet.id,
    query: { enabled: Boolean(resolved && address) },
  });
  const ready = !!resolved && !!evidence && !!face && !!price && !!due && !!description.trim();


  // With a wallet connected the seller creates the invoice themselves, so they are its on-chain supplier. Without one, the platform issuer does it (demo fallback).
  async function createFromWallet(vault: `0x${string}`, evidenceHash: Hash32) {
    setMining(true);
    try {
      let faceAmount: bigint, priceAmount: bigint;
      try {
        faceAmount = parseUnits(face.trim());
        priceAmount = parseUnits(price.trim());
      } catch {
        return toast("error", "Amounts must be numbers like 10 or 9.5.");
      }
      if (faceAmount <= 0n || priceAmount <= 0n || priceAmount > faceAmount) return toast("error", "The price must be above 0 and no more than the face amount.");
      const dueDate = Math.floor(new Date(`${due}T12:00:00Z`).getTime() / 1000);
      if (!Number.isFinite(dueDate) || dueDate * 1000 < Date.now()) return toast("error", "Pick a due date in the future.");
      toast("pending", "Confirm in your wallet, then wait for the network…");
      const hash = await writeContractAsync({
        address: contracts.invoiceMarket,
        abi: invoiceMarketAbi,
        functionName: "createInvoice",
        args: [vault, faceAmount, priceAmount, BigInt(dueDate), evidenceHash],
        chainId: hederaTestnet.id,
        gas: 600_000n, // Hedera under-estimates; a fixed limit above the real use
      });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: hederaTestnet.id });
      if (receipt.status !== "success") throw new Error("The transaction was reverted.");
      const created = parseEventLogs({ abi: invoiceMarketAbi, logs: receipt.logs, eventName: "InvoiceCreated" })[0] as { args?: { id?: bigint } } | undefined;
      const id = created?.args?.id?.toString();
      if (!id || !address) throw new Error("Created, but could not read the invoice number. Check your profile.");
      toast("success", `Invoice #${id} created on Hedera testnet. Saving the description…`);
      // The description is off-chain: sign it so only the real supplier can attach it, retrying until the indexer has seen the invoice.
      const text = description.trim();
      const msg = await invoiceDescriptionMessage(id, address, text);
      if (msg.ok && msg.data) {
        const signature = await signMessageAsync({ message: msg.data.message }).catch(() => null);
        if (signature) {
          for (let i = 0; i < 8; i += 1) {
            const r = await setInvoiceDescription(id, address, text, signature);
            if (r.ok || !r.retry) break;
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        } else toast("error", "The invoice is on-chain, but the description was not saved because signing was cancelled.");
      }
      router.push(`/invoice/${id}`);
    } catch (e) {
      toast("error", explainTxError(e));
    } finally {
      setMining(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!evidence) return;
    if (address && resolved) {
      void createFromWallet(resolved.vault as `0x${string}`, evidence);
      return;
    }
    run(
      () => createInvoice({ buyerName: buyer, face, price, dueDate: due, description, evidenceHash: evidence }),
      (r) => r.ok && r.data && router.push(`/invoice/${r.data.id}`),
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
    <Card className="p-6">
      <form onSubmit={submit} className="grid gap-5">
        <label className={label}>
          {copy.supplier.buyerLabel}
          <input className={input} value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder={copy.supplier.buyerPlaceholder} autoComplete="off" />
          {resolved ? (
            <span className="mt-1.5 flex items-center gap-1.5 text-xs font-normal text-status-paid">
              <CircleCheck aria-hidden="true" className="size-3.5" />
              {copy.supplier.resolved(shortHex(resolved.vault))}
              {resolved.status ? ` · ${resolved.status}` : ""}
              {resolved.limit ? ` · limit ${formatAmount(resolved.limit)} a day` : ""}
            </span>
          ) : (
            typed && (
              <span className="mt-1.5 block text-xs font-normal text-ink-muted">
                {current === "loading" ? "Checking ENS…" : current.kind === "unreachable" ? "ENS is not reachable right now. Try again, or paste the buyer vault's 0x address." : copy.error.ensNotFound}
              </span>
            )
          )}
        </label>
        {resolved && address && allowed === false && (
          <p className="-mt-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink-soft">
            This buyer has not allowed your wallet yet, so its agent will skip the invoice until they do. You can still create it. Ask the buyer to allow <span className="font-mono">{shortHex(address)}</span> on their profile.
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <label className={label}>
            {copy.supplier.faceLabel} (HBAR)
            <input className={input} inputMode="decimal" value={face} onChange={(e) => setFace(e.target.value)} placeholder="10" />
          </label>
          <label className={label}>
            {copy.supplier.priceLabel} (HBAR)
            <input className={input} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="9.5" />
          </label>
        </div>
        <label className={label}>
          {copy.supplier.dueLabel}
          <input className={input} type="date" value={due} min={inDays(1)} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className={label}>
          {copy.supplier.descriptionLabel}
          <textarea className={input} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className={label}>
          {copy.supplier.evidenceLabel}
          <input
            className="mt-1.5 block text-sm text-ink-soft file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
            type="file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setEvidence(f ? await sha256(await f.arrayBuffer()) : null);
            }}
          />
          <span className="mt-1.5 block text-xs font-normal text-ink-muted">{evidence ? `Fingerprint ${shortHex(evidence)}` : copy.supplier.evidenceHelp}</span>
        </label>
        <Button type="submit" size="lg" disabled={!ready || pending || mining} aria-busy={pending || mining}>
          {pending || mining ? "Working…" : copy.supplier.submit}
        </Button>
      </form>
      {toastEl}
    </Card>
    <div className="flex flex-col gap-4 lg:sticky lg:top-24">
      <InvoicePreview buyer={buyer} verified={!!resolved} face={face} price={price} due={due} description={description} evidence={!!evidence} />
      {aside}
    </div>
    </div>
  );
}
