import { formatEther, parseEther } from "viem";

export const WEI_PER_HBAR = 10n ** 18n;
export const TINYBAR_PER_HBAR = 10n ** 8n;
export const WEI_PER_TINYBAR = 10n ** 10n;

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
