import { formatEther, parseEther } from "viem";

// Amounts are integer base units. HBAR has 8 decimals (tinybar).
// Hedera's JSON-RPC relay takes EVM msg.value in weibar (18 decimals): 1 tinybar = 10^10 weibar.

export const HBAR_DECIMALS = 8;
export const WEIBAR_PER_TINYBAR = 10n ** 10n;
export const WEI_PER_HBAR = 10n ** 18n;
export const TINYBAR_PER_HBAR = 10n ** 8n;
export const WEI_PER_TINYBAR = 10n ** 10n;

/** "1.5" -> 150000000n with 8 decimals. Rejects more decimals than allowed. */
export function parseUnits(value: string, decimals = HBAR_DECIMALS): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(`not a decimal amount: ${value}`);
  const [whole, frac = ""] = value.split(".");
  if (frac.length > decimals) throw new Error(`too many decimals (max ${decimals}): ${value}`);
  return BigInt(whole + frac.padEnd(decimals, "0"));
}

/** 150000000n -> "1.5" with 8 decimals. */
export function formatUnits(amount: bigint | string, decimals = HBAR_DECIMALS): string {
  const v = BigInt(amount);
  const neg = v < 0n;
  const s = (neg ? -v : v).toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Tinybar amount (as stored in the spec) -> msg.value for an EVM call on Hedera. */
export function tinybarToWeibar(tinybar: bigint | string): bigint {
  return BigInt(tinybar) * WEIBAR_PER_TINYBAR;
}

/**
 * Converts an HBAR string (e.g. "1.5", "0.00000001") to 18-decimal EVM base units (wei equivalent on Hedera RPC).
 */
export function hbarToValue(hbar: string): bigint {
  return parseEther(hbar);
}

/**
 * Converts 18-decimal EVM base units to an HBAR string representation.
 */
export function valueToHbar(value: bigint): string {
  return formatEther(value);
}

/**
 * Converts Hedera native tinybars (10^8 per HBAR) to EVM 18-decimal base units.
 */
export function tinybarToValue(tinybar: bigint): bigint {
  return tinybar * WEI_PER_TINYBAR;
}

/**
 * Converts EVM 18-decimal base units to Hedera native tinybars.
 */
export function valueToTinybar(value: bigint): bigint {
  return value / WEI_PER_TINYBAR;
}

