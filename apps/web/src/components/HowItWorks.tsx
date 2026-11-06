"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";

const KEY = "ai.onboarding.dismissed";

type Step = { title: string; body: string; href?: string };
const roles: { id: string; label: string; steps: Step[] }[] = [
  { id: "investor", label: "I'm investing", steps: copy.onboarding.steps.map((s) => ({ ...s, href: "#market" })) },
  {
    id: "supplier",
    label: "I'm owed money",
    steps: [
      { title: "Get your name", body: "Connect a wallet and claim an ENS name on your profile.", href: "/profile" },
      { title: "Create the invoice", body: "Name the buyer agent, the amount and the due date.", href: "/supplier" },
      { title: "Get paid early", body: "When an investor funds it, the money lands in your wallet.", href: "/profile" },
    ],
  },
  {
    id: "sponsor",
    label: "I run a buyer agent",
    steps: [
      { title: "Check its record", body: "Your agent's limits and history are public on ENS.", href: "/network" },
      { title: "Approve big payments", body: "Anything above your threshold waits for you and World ID.", href: "/network" },
      { title: "Keep the score up", body: "On-time payments raise the credit score investors see.", href: "/network" },
    ],
  },
];

/** First-visit guide with one tab per role. Dismissed once, it stays hidden on this device. */
export function HowItWorks() {
  const [show, setShow] = useState(false);
  const [role, setRole] = useState(roles[0].id);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(KEY) !== "1");
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode: just hide for now */
    }
  };
  const active = roles.find((r) => r.id === role) ?? roles[0];

  return (
    <section aria-labelledby="hiw-title" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-5 py-3">
        <h2 id="hiw-title" className="text-sm font-semibold text-ink">{copy.onboarding.title}</h2>
        <div role="tablist" aria-label="Your role" className="flex gap-1 rounded-lg bg-subtle p-0.5 text-[13px]">
          {roles.map((r) => (
            <button
              key={r.id}
              role="tab"
              type="button"
              aria-selected={r.id === role}
              onClick={() => setRole(r.id)}
              className={cn("rounded-md px-2.5 py-1 font-medium", r.id === role ? "bg-surface text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-muted hover:text-ink")}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={dismiss} className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-ink-muted hover:bg-subtle hover:text-ink">
          {copy.onboarding.dismiss}
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      <ol role="tabpanel" className="grid sm:grid-cols-3">
        {active.steps.map((s, i) => (
          <li key={s.title} className={cn("flex gap-3 px-5 py-4", i > 0 && "border-t border-line sm:border-t-0 sm:border-l")}>
            <span aria-hidden="true" className="font-serif text-2xl leading-none text-accent italic">{i + 1}</span>
            <span>
              {s.href ? (
                <Link href={s.href} className="block text-sm font-semibold text-ink hover:text-accent">{s.title}</Link>
              ) : (
                <span className="block text-sm font-semibold text-ink">{s.title}</span>
              )}
              <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-muted">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
