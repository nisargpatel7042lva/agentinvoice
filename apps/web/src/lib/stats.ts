// Pure figures derived from real invoice data. Never invent numbers: empty input gives null, and the UI shows "—".
import { STATUSES, amountToNumber, type Invoice, type Status } from "@invoiceagent/shared";

// Whole USDC for charts (invoice amounts are USDC base units).
const hbar = (amount: string | bigint) => amountToNumber(amount);
const sum = (xs: Invoice[], f: (i: Invoice) => string) => xs.reduce((a, i) => a + BigInt(f(i)), 0n);

export function marketStats(invoices: Invoice[]) {
  const open = invoices.filter((i) => i.status === "Open");
  const funded = invoices.filter((i) => i.status !== "Pending" && i.status !== "Open");
  const settled = invoices.filter((i) => i.status === "Paid" || i.status === "Late" || i.status === "Defaulted");
  const paid = settled.filter((i) => i.status === "Paid").length;
  const avgBps = open.length
    ? open.reduce((a, i) => a + Number(((BigInt(i.faceAmount) - BigInt(i.price)) * 10_000n) / BigInt(i.faceAmount)), 0) / open.length
    : null;
  return {
    openCount: open.length,
    openFace: sum(open, (i) => i.faceAmount),
    avgDiscountPct: avgBps == null ? null : avgBps / 100,
    fundedVolume: sum(funded, (i) => i.price),
    fundedCount: funded.length,
    onTimePct: settled.length ? (paid / settled.length) * 100 : null,
    settledCount: settled.length,
  };
}

export function faceByStatus(invoices: Invoice[]): { status: Status; hbar: number }[] {
  return STATUSES.map((status) => ({
    status,
    hbar: hbar(sum(invoices.filter((i) => i.status === status), (i) => i.faceAmount)),
  }));
}

/** Settled invoices bucketed by ISO week of their due date, oldest first, last `weeks` buckets. */
export function repaymentsByWeek(invoices: Invoice[], weeks = 8) {
  const buckets = new Map<string, { label: string; start: number; onTime: number; late: number; defaulted: number }>();
  for (const i of invoices) {
    if (i.status !== "Paid" && i.status !== "Late" && i.status !== "Defaulted") continue;
    const d = new Date(i.dueDate * 1000);
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
    const key = monday.toISOString().slice(0, 10);
    const b = buckets.get(key) ?? { label: monday.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }), start: monday.getTime(), onTime: 0, late: 0, defaulted: 0 };
    if (i.status === "Paid") b.onTime++;
    else if (i.status === "Late") b.late++;
    else b.defaulted++;
    buckets.set(key, b);
  }
  return [...buckets.values()].sort((a, b) => a.start - b.start).slice(-weeks);
}
