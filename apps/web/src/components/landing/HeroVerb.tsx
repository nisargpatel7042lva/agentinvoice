"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BadgeCheck, HandCoins, Send, Wallet, type LucideIcon } from "lucide-react";

// One verb per role. Each has its own panel colour and icon tint, so the panel and the word read as one.
const VERBS: { word: string; who: string; icon: LucideIcon; tint: string }[] = [
  { word: "Fund", who: "as an investor", icon: HandCoins, tint: "#e8692f" },
  { word: "Sell", who: "as a supplier", icon: Send, tint: "#c9a210" },
  { word: "Pay", who: "as a buyer agent", icon: Wallet, tint: "#2f9e62" },
  { word: "Verify", who: "as a human sponsor", icon: BadgeCheck, tint: "#b0509f" },
];
const SLOT_MS = 2200;

/** Split hero: a colour panel with live product cards on the left, the headline and calls to action on the right. */
export function HeroVerb({ children }: { children: ReactNode }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let id = 0;
    const start = () => {
      window.clearInterval(id);
      id = window.setInterval(() => setI((n) => (n + 1) % VERBS.length), SLOT_MS);
    };
    const vis = () => (document.hidden ? window.clearInterval(id) : start());
    start();
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  const v = VERBS[i];
  const Icon = v.icon;

  return (
    <section className="lp-hero">
      <div className="lp-panel" aria-hidden="true">
        {VERBS.map((x, n) => (
          <div key={x.word} className={`lp-layer lp-layer-${n}`} data-on={n === i} />
        ))}
        <div className="lp-grain" />

        <div className="lp-cards">
          <div className="lp-card lp-card-coral">
            <span className="lp-card-k">TO BE REPAID</span>
            <span className="lp-card-big">10.00 HBAR</span>
            <span className="lp-chip">+5.3% return</span>
            <span className="lp-card-foot">
              Invoice #0413 · due 9 Nov <u>VIEW</u>
            </span>
          </div>
          <div className="lp-card lp-card-glass">
            <div className="lp-row">
              <span>Harbor Logistics</span>
              <b>+9.50</b>
            </div>
            <div className="lp-row">
              <span>Atlas Print Co.</span>
              <b className="lp-neg">funded</b>
            </div>
            <div className="lp-row">
              <span>Kiln &amp; Co.</span>
              <b className="lp-neg">funded</b>
            </div>
            <div className="lp-row lp-row-white">
              <span>Invoice #0412 is due tomorrow</span>
              <i>AGENT WILL PAY ↗</i>
            </div>
          </div>
          <div className="lp-card lp-card-dark">
            <span className="lp-card-top">
              <span>Credit score</span>
              <span>Band A</span>
            </span>
            <span className="lp-score">789</span>
            <span className="lp-card-foot">buyer-agent.eth · 14 settled</span>
          </div>
        </div>

        <p className="lp-corner">
          Paid,
          <br />
          <em>today.</em>
        </p>
      </div>

      <div className="lp-copy">
        <h1 className="lp-h1">
          <span className="lp-slot" aria-live="polite">
            <span key={v.word} className="lp-verb">
              <span className="lp-icon" style={{ background: v.tint }}>
                <Icon />
              </span>
              {v.word}
            </span>
          </span>
          <span className="lp-line">invoices</span>
          <em className="lp-line">before they&apos;re due.</em>
        </h1>
        <p key={v.who} className="lp-who">
          {v.who}
        </p>
        {children}
      </div>
    </section>
  );
}
