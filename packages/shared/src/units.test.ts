import { describe, expect, it } from "vitest";
import { hbarToValue, valueToHbar, tinybarToValue, valueToTinybar } from "./units.js";

describe("Hedera unit conversions", () => {
  it("converts 1 HBAR to 18 decimals and back", () => {
    const val = hbarToValue("1");
    expect(val).toBe(1000000000000000000n);
    expect(valueToHbar(val)).toBe("1");
  });

  it("converts 1 tinybar (0.00000001 HBAR) correctly", () => {
    const val = hbarToValue("0.00000001");
    expect(val).toBe(10000000000n); // 10^10 wei
    expect(valueToHbar(val)).toBe("0.00000001");
  });

  it("converts fractional amounts without precision loss", () => {
    const val = hbarToValue("95.5");
    expect(val).toBe(95500000000000000000n);
    expect(valueToHbar(val)).toBe("95.5");
  });

  it("converts between tinybars and EVM base units", () => {
    const tinybar = 100_000_000n; // 1 HBAR
    const evmValue = tinybarToValue(tinybar);
    expect(evmValue).toBe(10n ** 18n);
    expect(valueToTinybar(evmValue)).toBe(tinybar);
  });
});

