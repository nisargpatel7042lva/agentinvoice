"use client";

import { useState } from "react";
import { ensAgentFixture, parseUnits, type Hash32 } from "@agentinvoice/shared";
import { Card } from "@/components/Card";
import { Toast } from "@/components/Toast";
import { api, isMock } from "@/lib/api";
import { copy } from "@/lib/copy";
import { shortHex } from "@/lib/format";

const input = "mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm focus:outline-2 focus:outline-accent";

async function sha256(file: File): Promise<Hash32> {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return `0x${[...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function SupplierForm() {
  const [buyer, setBuyer] = useState("");
  const [face, setFace] = useState("");
  const [price, setPrice] = useState("");
  const [due, setDue] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState<Hash32 | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  // Live ENS resolution (viem) lands with the ENS step; mock mode resolves the sample buyer.
  const resolved = isMock && buyer === ensAgentFixture.name ? ensAgentFixture : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolved || !evidence) return;
    try {
      await api.createInvoice({
        buyerVault: resolved.vault,
        faceAmount: parseUnits(face).toString(),
        price: parseUnits(price).toString(),
        dueDate: Math.floor(new Date(due).getTime() / 1000),
        description,
        evidenceHash: evidence,
      });
      setToast({ kind: "success", message: copy.supplier.created });
    } catch {
      setToast({ kind: "error", message: copy.error.generic });
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4 text-sm">
        <label>
          {copy.supplier.buyerLabel}
          <input className={input} value={buyer} onChange={(e) => setBuyer(e.target.value.trim())} placeholder={copy.supplier.buyerPlaceholder} />
          {resolved && <span className="mt-1 block text-xs text-status-paid">{copy.supplier.resolved(shortHex(resolved.vault))} · {resolved.status}</span>}
        </label>
        <label>
          {copy.supplier.faceLabel}
          <input className={input} inputMode="decimal" value={face} onChange={(e) => setFace(e.target.value)} />
        </label>
        <label>
          {copy.supplier.priceLabel}
          <input className={input} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label>
          {copy.supplier.dueLabel}
          <input className={input} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label>
          {copy.supplier.descriptionLabel}
          <textarea className={input} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          {copy.supplier.evidenceLabel}
          <input className="mt-1 block text-sm" type="file" onChange={async (e) => { const f = e.target.files?.[0]; setEvidence(f ? await sha256(f) : null); }} />
          <span className="mt-1 block text-xs text-ink-muted">{evidence ? shortHex(evidence) : copy.supplier.evidenceHelp}</span>
        </label>
        <button type="submit" disabled={!resolved || !evidence || !face || !price || !due} className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-50">
          {copy.supplier.submit}
        </button>
      </form>
      {toast && <Toast kind={toast.kind} message={toast.message} />}
    </Card>
  );
}
