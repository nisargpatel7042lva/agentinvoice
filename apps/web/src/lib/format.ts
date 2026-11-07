import { formatUnits, SAUCERSWAP_TESTNET_USDC, SETTLEMENT, type Amount, type Invoice } from "@invoiceagent/shared";

/** An invoice amount (USDC base units, 6 decimals) as "1,234.5 USDC". Every invoice payment settles in USDC. */
export function formatAmount(amount: Amount | bigint, decimals: number = SETTLEMENT.decimals): string {
  const [whole, frac] = formatUnits(amount, decimals).split(".");
  const grouped = Number(whole).toLocaleString("en-US");
  return `${grouped}${frac ? `.${frac.slice(0, 2)}` : ""} ${SETTLEMENT.symbol}`;
}

/** Native HBAR in tinybar (gas, wallet balance, the HBAR side of a swap). */
export function formatHbarUnits(tinybar: bigint | string): string {
  const [whole, frac] = formatUnits(tinybar, 8).split(".");
  return `${Number(whole).toLocaleString("en-US")}${frac ? `.${frac.slice(0, 2)}` : ""} HBAR`;
}

/** Format SaucerSwap testnet USDC base units (6 decimals). Label makes the token identity explicit. */
export function formatUsdc(amount: Amount | bigint | string, decimals = SAUCERSWAP_TESTNET_USDC.decimals): string {
  const [whole, frac] = formatUnits(amount, decimals).split(".");
  const grouped = Number(whole).toLocaleString("en-US");
  return `${grouped}${frac ? `.${frac.slice(0, 2)}` : ""} USDC`;
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

/** A plain number of USDC (already in whole USDC, e.g. a chart total) as "1,234.5 USDC". */
export function formatMoney(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${SETTLEMENT.symbol}`;
}
