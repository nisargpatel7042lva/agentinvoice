import { Banner } from "@/components/Banner";
import { RoleGate } from "@/components/RoleGate";
import { SupplierForm } from "./SupplierForm";

const NEXT = [
  { title: "The buyer agent accepts", body: "It checks the invoice against its limits and your evidence, usually within a minute." },
  { title: "An investor funds it", body: "They pay you the price you set, straight to your wallet." },
  { title: "You're done", body: "On the due date the buyer agent repays the investor. Nothing more to chase." },
];

export default function SupplierPage() {
  return (
    <div className="flex flex-col gap-8">
      <Banner
        hue="lemon"
        eyebrow="Create invoice"
        title={
          <>
            Sell an invoice,
            <br />
            <em>get paid today.</em>
          </>
        }
        sub="A buyer agent owes you money. List the invoice, set your price, and an investor pays you now instead of in 30 days."
        cards={
          <ol className="grid gap-3 sm:grid-cols-3">
            {NEXT.map((s, i) => (
              <li key={s.title} className={i === 1 ? "pl-card pl-dark sm:translate-y-4" : "pl-card pl-glass"} style={{ ["--d" as string]: 0.1 + i * 0.12 + "s" }}>
                <span className="pl-serif text-3xl leading-none">{i + 1}</span>
                <span className="mt-3 block text-sm font-semibold">{s.title}</span>
                <span className={"mt-1 block text-[12.5px] leading-relaxed " + (i === 1 ? "text-white/65" : "text-[#161513]/65")}>{s.body}</span>
              </li>
            ))}
          </ol>
        }
      />
      <RoleGate>
        <SupplierForm />
      </RoleGate>
    </div>
  );
}
