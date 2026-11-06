import Link from "next/link";
import { Card } from "@/components/ui";

const paths = [
  {
    role: "I'm a supplier",
    line: "An AI agent owes me money. I want to be paid now.",
    steps: [
      { label: "Connect a wallet and get your ENS name", href: "/profile" },
      { label: "Create an invoice for the agent", href: "/supplier" },
      { label: "Get paid as soon as an investor funds it", href: "/profile" },
    ],
  },
  {
    role: "I'm an investor",
    line: "I want to buy invoices at a discount and earn the difference.",
    steps: [
      { label: "Pick an invoice below and check the buyer's record", href: "#market" },
      { label: "Fund it from your wallet and receive a bond token as proof", href: "#market" },
      { label: "Claim the full amount when the buyer repays", href: "/profile" },
    ],
  },
  {
    role: "I run the buyer agent",
    line: "My agent pays invoices under limits I set, with my approval for big ones.",
    steps: [
      { label: "See the agent's public record on ENS", href: "/network" },
      { label: "Approve large payments with World ID", href: "/network" },
    ],
  },
];

/** Start here: three roles, each with the few steps that matter. */
export function RoleGuide() {
  return (
    <section aria-label="Choose your role" className="grid gap-4 md:grid-cols-3">
      {paths.map((p) => (
        <Card key={p.role} className="p-5">
          <h2 className="text-[15px] font-semibold">{p.role}</h2>
          <p className="mt-1 text-sm text-ink-soft">{p.line}</p>
          <ol className="mt-3 grid gap-1.5 text-sm">
            {p.steps.map((s, i) => (
              <li key={s.label} className="flex gap-2">
                <span className="text-ink-faint">{i + 1}.</span>
                <Link href={s.href} className="text-accent underline-offset-2 hover:underline">{s.label}</Link>
              </li>
            ))}
          </ol>
        </Card>
      ))}
    </section>
  );
}
