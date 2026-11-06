import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/cn";

// Illustrative preview of the marketplace (sample names from the demo directory, clearly a product shot, not live data).
const ROWS = [
  { name: "buyer-agent.eth", score: "A · 92", pay: "950", back: "1,000", ret: "+5.3%", tone: "text-band-a bg-band-a-bg" },
  { name: "northwind-agent.eth", score: "B · 78", pay: "2,268", back: "2,400", ret: "+5.8%", tone: "text-band-b bg-band-b-bg" },
  { name: "globex-agent.eth", score: "C · 43", pay: "552", back: "600", ret: "+8.7%", tone: "text-band-c bg-band-c-bg" },
];

/** A tilted glass panel showing the marketplace, with a glowing cyan top edge. Pure CSS, no image assets. */
export function ProductPanel({ className, tilt = "right" }: { className?: string; tilt?: "right" | "left" }) {
  return (
    <figure
      aria-label="Preview of the AgentInvoice marketplace"
      className={cn("relative mx-auto w-full max-w-[560px] [perspective:1400px]", className)}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b1a33]/90 text-white shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7),0_0_0_1px_rgba(143,230,244,0.08)] backdrop-blur",
          "transition-transform duration-700 ease-[cubic-bezier(.22,.7,.2,1)]",
          tilt === "right" ? "[transform:rotateY(-14deg)_rotateX(7deg)] hover:[transform:rotateY(-8deg)_rotateX(4deg)]" : "[transform:rotateY(14deg)_rotateX(7deg)] hover:[transform:rotateY(8deg)_rotateX(4deg)]",
        )}
      >
        {/* glowing top edge */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,#8fe6f4,transparent)]" />
        <div aria-hidden="true" className="absolute inset-x-10 -top-10 h-20 rounded-full bg-[#2fe0d0]/25 blur-2xl" />

        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3.5 text-[13px]">
          <BrandMark size={18} />
          <span className="font-medium">AgentInvoice</span>
          <span className="ml-auto rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] text-white/70">Ready to fund</span>
        </div>

        <div className="px-5 py-4">
          <div className="grid grid-cols-[1.6fr_.8fr_.8fr_.8fr] gap-2 text-[11px] text-white/45">
            <span>Buyer</span>
            <span>Score</span>
            <span className="text-right">You pay</span>
            <span className="text-right">Return</span>
          </div>
          <ul className="mt-2 divide-y divide-white/8">
            {ROWS.map((r, i) => (
              <li key={r.name} className="grid grid-cols-[1.6fr_.8fr_.8fr_.8fr] items-center gap-2 py-2.5 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="flex size-6 flex-none items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold">
                    {r.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate">{r.name}</span>
                </span>
                <span><span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", r.tone)}>{r.score}</span></span>
                <span className="text-right font-medium">{r.pay}</span>
                <span className={cn("text-right font-medium", i === 2 ? "text-[#fcd34d]" : "text-[#86efac]")}>{r.ret}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-[12px]">
            <span className="text-white/60">buyer-agent.eth repays on 12 Nov</span>
            <span className="flex items-center gap-1.5 rounded-full bg-[#2fe0d0] px-3 py-1 text-[12px] font-medium text-[#0b1d3a]">Fund 950 HBAR</span>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">Sample buyers with their credit score, the price you pay and your return.</figcaption>
    </figure>
  );
}
