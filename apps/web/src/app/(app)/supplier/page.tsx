import { PageHeader } from "@/components/PageHeader";
import { copy } from "@/lib/copy";
import { SupplierForm } from "./SupplierForm";

const NEXT = [
  { title: "The buyer agent accepts", body: "It checks the invoice against its limits and your evidence, usually within a minute." },
  { title: "An investor funds it", body: "They pay you the price you set, straight to your wallet." },
  { title: "You're done", body: "On the due date the buyer agent repays the investor. Nothing more to chase." },
];

export default function SupplierPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={copy.supplier.title} sub="Sell an invoice a buyer agent owes you and get paid before the due date." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <SupplierForm />
        <aside aria-labelledby="next-title" className="rounded-xl border border-line bg-sidebar p-5 lg:sticky lg:top-24">
          <h2 id="next-title" className="text-sm font-semibold">What happens next</h2>
          <ol className="mt-4 flex flex-col gap-4">
            {NEXT.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span aria-hidden="true" className="font-serif text-2xl leading-none text-accent italic">{i + 1}</span>
                <span>
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-muted">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
