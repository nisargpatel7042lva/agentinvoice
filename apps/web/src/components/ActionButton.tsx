"use client";

import { useTransition, type ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import type { ActionResult } from "@/app/actions";
import { buttonVariants } from "@/components/ui";
import { toast } from "@/components/ToastHost";
import { cn } from "@/lib/cn";

/** Runs a server action, shows "Working…" while it runs, then a toast with the result. */
export function useAction() {
  const [pending, start] = useTransition();

  function run<T>(action: () => Promise<ActionResult<T>>, after?: (r: ActionResult<T>) => void) {
    start(async () => {
      try {
        const r = await action();
        toast(r.ok ? "success" : "error", r.message);
        after?.(r);
      } catch {
        toast("error", "Something went wrong. Nothing was charged. Please try again.");
      }
    });
  }
  const toastEl = null; // toasts render in <ToastHost/> in the layout
  return { pending, run, toastEl };
}

type Props<T> = {
  action: () => Promise<ActionResult<T>>;
  children: ReactNode;
  after?: (r: ActionResult<T>) => void;
  className?: string;
} & VariantProps<typeof buttonVariants>;

export function ActionButton<T>({ action, after, children, className, variant, size }: Props<T>) {
  const { pending, run, toastEl } = useAction();
  return (
    <>
      <button type="button" disabled={pending} aria-busy={pending} onClick={() => run(action, after)} className={cn(buttonVariants({ variant, size }), className)}>
        {pending ? "Working…" : children}
      </button>
      {toastEl}
    </>
  );
}
