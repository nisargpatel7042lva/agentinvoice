import { describe, expect, it, vi } from "vitest";
import { createSaucerSwapConfig } from "@invoiceagent/shared/saucerswap";
import { TINYBAR_PER_HBAR } from "@invoiceagent/shared";
import { maybeSwapExcessHbarToUsdc, swapRulesFromEnv } from "./swap.js";

const ONE = TINYBAR_PER_HBAR;

describe("investor saucerswap treasury helper", () => {
  it("reads enable + amounts from env", () => {
    expect(swapRulesFromEnv({}).enabled).toBe(false);
    const rules = swapRulesFromEnv({
      SAUCERSWAP_ENABLE_AGENT_SWAP: "1",
      SAUCERSWAP_SWAP_HBAR: "2",
      SAUCERSWAP_KEEP_HBAR: "5",
    });
    expect(rules.enabled).toBe(true);
    expect(rules.swapAmountTinybar).toBe(2n * ONE);
    expect(rules.keepHbarTinybar).toBe(5n * ONE);
  });

  it("skips when balance below swap+keep", async () => {
    const config = createSaucerSwapConfig({ dryRun: true, operatorAccountId: "0.0.1" });
    const log = vi.fn();
    const r = await maybeSwapExcessHbarToUsdc(
      config,
      { enabled: true, swapAmountTinybar: ONE, keepHbarTinybar: 10n * ONE },
      { getHbarBalance: async () => 5n * ONE },
      log,
    );
    expect(r).toMatchObject({ action: "skipped" });
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/saucerswap skipped/));
  });

  it("dry-run swaps when affordable", async () => {
    const { encodeAbiParameters, parseAbiParameters } = await import("viem");
    const quoteResult = encodeAbiParameters(parseAbiParameters("uint256, uint160[], uint32[], uint256"), [
      2_000_000n,
      [],
      [],
      1n,
    ]);
    const config = createSaucerSwapConfig({ dryRun: true, operatorAccountId: "0.0.1" });
    const r = await maybeSwapExcessHbarToUsdc(
      config,
      { enabled: true, swapAmountTinybar: ONE, keepHbarTinybar: ONE },
      {
        getHbarBalance: async () => 20n * ONE,
        isTokenAssociated: async () => true,
        fetch: vi.fn(async () => new Response(JSON.stringify({ result: quoteResult }), { status: 200 })) as unknown as typeof fetch,
        now: () => 1_700_000_000_000,
      },
    );
    expect(r.action).toBe("swapped");
    if (r.action === "swapped") expect(r.result.ok && "dryRun" in r.result && r.result.dryRun).toBe(true);
  });
});
