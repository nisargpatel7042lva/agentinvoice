"use client";

import { useEffect, useState } from "react";
import { Toast } from "@/components/Toast";

type Item = { id: number; kind: "pending" | "success" | "error"; message: string };
type Listener = (t: Item) => void;

const listeners = new Set<Listener>();
let next = 1;

/** Show a toast from anywhere. It lives in the layout, so it survives the button that triggered it disappearing. */
export function toast(kind: Item["kind"], message: string) {
  const item = { id: next++, kind, message };
  listeners.forEach((l) => l(item));
}

export function ToastHost() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const l: Listener = (t) => {
      setItems((xs) => [...xs.slice(-2), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 4500);
    };
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2">
      {items.map((t) => (
        <Toast key={t.id} kind={t.kind} message={t.message} />
      ))}
    </div>
  );
}
