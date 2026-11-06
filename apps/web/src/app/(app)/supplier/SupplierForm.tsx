"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import { ensAgentFixture, type Hash32 } from "@agentinvoice/shared";
import { createInvoice, lookupBuyer } from "@/app/actions";
import type { BuyerLookup } from "@/lib/ens";
import { useAction } from "@/components/ActionButton";
import { Button, Card } from "@/components/ui";
import { copy } from "@/lib/copy";
import { isMock } from "@/lib/env";
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
  const ready = !!resolved && !!evidence && !!face && !!price && !!due && !!description.trim();

  async function fillSample() {
    setBuyer(ensAgentFixture.name);
    setFace("12");
    setPrice("11.4");
    setDue(inDays(7));
    setDescription("Sample: 40 hours of data labelling, October");
    setEvidence(await sha256(new TextEncoder().encode("sample evidence").buffer as ArrayBuffer));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!evidence) return;
    run(
      () => createInvoice({ buyerName: buyer, face, price, dueDate: due, description, evidenceHash: evidence }),
      (r) => r.ok && r.data && router.push(`/invoice/${r.data.id}`),
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
    <Card className="p-6">
      {isMock && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-subtle px-4 py-3 text-[13px] text-ink-soft">
          <span>Demo mode: the only known buyer is <span className="font-mono">{ensAgentFixture.name}</span>.</span>
          <Button type="button" variant="outline" size="sm" onClick={fillSample}>Fill with sample values</Button>
        </div>
      )}
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
        <Button type="submit" size="lg" disabled={!ready || pending} aria-busy={pending}>
          {pending ? "Working…" : copy.supplier.submit}
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
