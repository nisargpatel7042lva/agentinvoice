import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/cn";

/** The invoice as investors will see it, drawn live from the form. */
export function InvoicePreview({ buyer, verified, face, price, due, description, evidence }: { buyer: string; verified: boolean; face: string; price: string; due: string; description: string; evidence: boolean }) {
  const f = Number(face);
  const p = Number(price);
  const valid = f > 0 && p > 0 && p < f;
  const ret = valid ? ((f - p) / p) * 100 : null;
  const dueLabel = due ? new Date(due + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Pick a date";

  return (
    <div className="pl-card pl-coral flex flex-col gap-5 p-6" aria-live="polite" aria-label="Invoice preview">
      <div className="flex items-center justify-between gap-2 font-mono text-[11.5px] tracking-[0.06em]">
        <span>INVOICE · DRAFT</span>
        <span className="pl-chip">{ret == null ? "Return —" : "+" + ret.toFixed(1) + "% for investors"}</span>
      </div>
      <div>
        <div className="text-[13px] opacity-70">Amount owed</div>
        <div className="mt-1 text-[44px] leading-none font-medium tracking-[-0.045em]">
          {f > 0 ? f.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "0"} <span className="text-lg tracking-normal opacity-60">HBAR</span>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#161513]/20 pt-4 text-[13px]">
        <div className="col-span-2">
          <dt className="opacity-65">Bill to</dt>
          <dd className="flex items-center gap-1.5 font-medium">
            <span className="truncate">{buyer.trim() || "buyer-name.eth"}</span>
            {verified && <BadgeCheck aria-label="Found on ENS" className="size-4 flex-none" />}
          </dd>
        </div>
        <div>
          <dt className="opacity-65">Due</dt>
          <dd className="font-medium">{dueLabel}</dd>
        </div>
        <div>
          <dt className="opacity-65">Evidence</dt>
          <dd className="font-medium">{evidence ? "Fingerprinted" : "Not added"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="opacity-65">For</dt>
          <dd className={cn("line-clamp-2 font-medium", !description.trim() && "opacity-50")}>{description.trim() || "What the invoice is for"}</dd>
        </div>
      </dl>
      <div className="flex items-center justify-between gap-3 rounded-xl bg-[#161513] px-4 py-3 text-[#f3f1ec]">
        <span className="text-[13px] opacity-75">You receive today</span>
        <span className="pl-serif text-2xl">{p > 0 ? p.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " HBAR" : "—"}</span>
      </div>
      {f > 0 && p >= f && <p className="text-[13px] font-medium">The price must be lower than the amount owed, or no investor will fund it.</p>}
    </div>
  );
}
