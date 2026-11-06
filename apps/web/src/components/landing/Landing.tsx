import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { marketStats } from "@/lib/stats";
import { HeroVerb } from "./HeroVerb";
import { Belt } from "./Belt";

const STEPS = [
  { who: "Supplier", title: "Sells an invoice", body: "A buyer agent owes them 10 HBAR in 30 days. They list the invoice and take 9.5 HBAR today." },
  { who: "Investor", title: "Funds it", body: "They pay the supplier now, check the buyer's credit score first, and hold a bond token as proof." },
  { who: "Buyer agent", title: "Pays on time", body: "On the due date the agent repays the full amount within limits its human sponsor set on-chain." },
];

/** Landing: split hero, live stats strip, the settlement belt, three steps and a closing call to action. */
export async function Landing() {
  const invoices = await api.listInvoices().catch(() => null);
  const s = invoices ? marketStats(invoices) : null;
  const stats = [
    { value: s ? `${s.fundedCount}` : "—", label: "Invoices funded" },
    { value: s ? formatAmount(s.fundedVolume.toString()) : "—", label: "Paid to suppliers early" },
    { value: s?.onTimePct != null ? `${Math.round(s.onTimePct)}%` : "—", label: "Repaid on time" },
  ];

  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/" className="lp-brand">
          <BrandMark size={24} />
          AgentInvoice
        </Link>
        <nav aria-label="Site" className="lp-links">
          <Link href="/market">Marketplace</Link>
          <a href="#how">How it works</a>
          <Link href="/network">Network</Link>
        </nav>
        <div className="lp-nav-right">
          <ThemeToggle />
          <Link href="/market" className="lp-btn lp-btn-ink">
            Open the app
          </Link>
        </div>
      </header>

      <HeroVerb>
        <p className="lp-lede">
          Suppliers get paid today. Investors earn a fixed return. AI buyer agents repay on the due date, and a verified human answers for each one.
        </p>
        <div className="lp-ctas">
          <Link href="/market" className="lp-cta">
            Browse invoices
            <span aria-hidden="true" className="lp-cta-arrow">
              <ArrowRight />
            </span>
          </Link>
          <Link href="/supplier" className="lp-link">
            I&apos;m owed money <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
        <p className="lp-facts">Settles on Hedera · Every agent has a human sponsor</p>
      </HeroVerb>

      <section aria-label="Live numbers" className="lp-strip">
        <svg className="lp-notch" viewBox="0 0 1440 62" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 62 H1062 C1092 62 1098 54 1116 34 C1138 9 1146 1 1178 1 H1440 V62 Z" />
        </svg>
        <a href="#belt" className="lp-scroll">↓ Watch an invoice settle</a>
        <div className="lp-strip-inner">
          <p className="lp-strip-title">
            Live on <em>Hedera testnet</em>
          </p>
          <dl className="lp-stats">
            {stats.map((x) => (
              <div key={x.label}>
                <dt>{x.label}</dt>
                <dd>{x.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="belt" className="lp-belt-section">
        <div className="lp-belt-head">
          <div>
            <p className="lp-eyebrow">SETTLEMENT</p>
            <h2 className="lp-h2">
              Unpaid on the right.
              <br />
              <em>Paid on the left.</em>
            </h2>
          </div>
          <p className="lp-belt-copy">
            Every invoice that crosses the line is repaid by its buyer agent and written to Hedera&apos;s public log. Drag the belt to run it backwards.
          </p>
        </div>
        <Belt />
      </section>

      <section id="how" className="lp-how">
        <p className="lp-eyebrow">HOW IT WORKS</p>
        <h2 className="lp-h2">
          Three parties, <em>one invoice.</em>
        </h2>
        <ol className="lp-steps">
          {STEPS.map((st, i) => (
            <li key={st.who}>
              <span className="lp-step-n">{i + 1}</span>
              <span className="lp-step-who">{st.who}</span>
              <h3>{st.title}</h3>
              <p>{st.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-close">
        <h2>
          Get paid today
          <br />
          <em>for next month&apos;s invoice.</em>
        </h2>
        <div className="lp-ctas">
          <Link href="/market" className="lp-cta">
            Browse invoices
            <span aria-hidden="true" className="lp-cta-arrow">
              <ArrowRight />
            </span>
          </Link>
          <Link href="/supplier" className="lp-link lp-link-light">
            Create an invoice <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="lp-foot">
        <span className="lp-brand">
          <BrandMark size={20} />
          AgentInvoice
        </span>
        <span>Testnet prototype. Not financial advice.</span>
      </footer>
    </div>
  );
}
