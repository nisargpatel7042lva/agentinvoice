"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { copy } from "@/lib/copy";

const KEY = "ai.onboarding.dismissed";

/** First-visit guide. Dismissed once, it stays hidden on this device. */
export function HowItWorks() {
  const [show, setShow] = useState(false);
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

  return (
    <section aria-labelledby="hiw-title" className="rounded-xl border border-accent-200 bg-accent-soft p-5">
      <div className="flex items-start justify-between gap-4">
        <h2 id="hiw-title" className="text-[15px] font-semibold text-ink">{copy.onboarding.title}</h2>
        <button type="button" onClick={dismiss} className="flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-accent hover:bg-surface">
          {copy.onboarding.dismiss}
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {copy.onboarding.steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span aria-hidden="true" className="flex size-7 flex-none items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-on-accent">{i + 1}</span>
            <span>
              <span className="block text-sm font-semibold text-ink">{s.title}</span>
              <span className="mt-0.5 block text-[13px] text-ink-soft">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
