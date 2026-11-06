import { formatUnits, type Amount, type Invoice } from "@agentinvoice/shared";

export function formatAmount(amount: Amount, decimals = 8): string {
  const [whole, frac] = formatUnits(amount, decimals).split(".");
  const grouped = Number(whole).toLocaleString("en-US");
  return `${grouped}${frac ? `.${frac.slice(0, 2)}` : ""} HBAR`;
}

export function shortHex(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

export function discountPct(inv: Pick<Invoice, "faceAmount" | "price">): string {
  const face = BigInt(inv.faceAmount);
  if (face === 0n) return "0.0%";
  const bps = ((face - BigInt(inv.price)) * 10_000n) / face;
  return `${(Number(bps) / 100).toFixed(1)}%`;
}

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
