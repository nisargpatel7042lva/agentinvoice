"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { contracts, ensAgentFixture, type Hash32 } from "@agentinvoice/shared";
import { createInvoice } from "@/app/actions";
import { useAction } from "@/components/ActionButton";
import { Button, Card } from "@/components/ui";
import { copy } from "@/lib/copy";
import { isMock } from "@/lib/env";
import { formatAmount, shortHex } from "@/lib/format";

const input = "mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-accent";
const label = "block text-sm font-medium text-ink";

async function sha256(data: ArrayBuffer): Promise<Hash32> {
  const buf = await crypto.subtle.digest("SHA-256", data);
  return `0x${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function inDays(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

export function SupplierForm() {
  const router = useRouter();
  const { pending, run, toastEl } = useAction();
  const [buyer, setBuyer] = useState("");
  const [face, setFace] = useState("");
  const [price, setPrice] = useState("");
  const [due, setDue] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState<Hash32 | null>(null);

  // Demo: the sample ENS buyer. Real: the configured buyer name (NEXT_PUBLIC_BUYER_ENS_NAME) maps to the deployed
  // BuyerVault, or a 0x vault address is used as-is. Live ENS resolution replaces this when it lands.
  const realName = process.env.NEXT_PUBLIC_BUYER_ENS_NAME || "buyer-agent.eth";
  const typed = buyer.trim();
  const resolved: { vault: string; status?: string; limit?: string } | null = isMock
    ? typed === ensAgentFixture.name
      ? ensAgentFixture
      : null
    : /^0x[0-9a-fA-F]{40}$/.test(typed)
      ? { vault: typed }
      : typed.toLowerCase() === realName.toLowerCase()
        ? { vault: contracts.buyerVault }
        : null;
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
            buyer.trim() && <span className="mt-1.5 block text-xs font-normal text-ink-muted">{copy.error.ensNotFound}</span>
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
  );
}
