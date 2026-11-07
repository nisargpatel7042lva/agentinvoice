import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import { swapRouterAbi } from "./saucerswap/abi";
import { encodeV3Path, WHBAR_TOKEN_ID } from "./saucerswap/config";
import { encodeExactInputMulticall } from "./saucerswap/swap";
import { amountToNumber, buildHbarToUsdcSwap, formatAmountUnits, parseAmount, SAUCERSWAP_ROUTER, SETTLEMENT, shortfall } from "./settlement";

const RECIPIENT = "0xbc792de2be972434a996f222da426b590e858056" as const;

describe("settlement asset (USDC)", () => {
  it("is SaucerSwap testnet USDC 0.0.5449 with 6 decimals at its long-zero address", () => {
    expect(SETTLEMENT).toMatchObject({ symbol: "USDC", decimals: 6, tokenId: "0.0.5449" });
    expect(SETTLEMENT.address).toBe("0x0000000000000000000000000000000000001549");
  });

  it("parses and formats 6-decimal amounts exactly", () => {
    expect(parseAmount("12.5")).toBe(12_500_000n);
    expect(parseAmount("0.000001")).toBe(1n);
    expect(() => parseAmount("1.0000001")).toThrow(/too many decimals/);
    expect(formatAmountUnits(12_500_000n)).toBe("12.5");
    expect(amountToNumber("1999999")).toBeCloseTo(1.999999);
    expect(shortfall(5n, 9n)).toBe(4n);
    expect(shortfall(9n, 5n)).toBe(0n);
  });
});

describe("buildHbarToUsdcSwap", () => {
  const args = { amountInTinybar: 100_000_000n, amountOutMinimum: 2_401_043n, recipient: RECIPIENT, deadline: 1_800_000_600 };

  it("targets the SaucerSwap V2 router and sends the HBAR amount", () => {
    const tx = buildHbarToUsdcSwap(args);
    expect(tx.to).toBe(SAUCERSWAP_ROUTER);
    expect(SAUCERSWAP_ROUTER).toBe("0x0000000000000000000000000000000000159398"); // 0.0.1414040
    expect(tx.valueTinybar).toBe(100_000_000n);
  });

  it("is byte-for-byte the multicall(exactInput, refundETH) the tested swap library builds", () => {
    const tx = buildHbarToUsdcSwap(args);
    const reference = encodeExactInputMulticall({
      path: encodeV3Path(WHBAR_TOKEN_ID, 3000, SETTLEMENT.tokenId),
      recipientEvm: RECIPIENT,
      deadline: args.deadline,
      amountIn: args.amountInTinybar,
      amountOutMinimum: args.amountOutMinimum,
    });
    expect(tx.data).toBe(("0x" + Buffer.from(reference).toString("hex")) as `0x${string}`);
  });

  it("sends the USDC to the given recipient (a wallet or a buyer vault)", () => {
    const outer = decodeFunctionData({ abi: swapRouterAbi, data: buildHbarToUsdcSwap(args).data });
    const inner = decodeFunctionData({ abi: swapRouterAbi, data: (outer.args as readonly [readonly `0x${string}`[]])[0][0] });
    const params = (inner.args as readonly [{ recipient: string; amountOutMinimum: bigint }])[0];
    expect(params.recipient.toLowerCase()).toBe(RECIPIENT);
    expect(params.amountOutMinimum).toBe(2_401_043n);
  });

  it("refuses to swap without a quote-based minimum", () => {
    expect(() => buildHbarToUsdcSwap({ ...args, amountOutMinimum: 0n })).toThrow(/quote/);
    expect(() => buildHbarToUsdcSwap({ ...args, amountInTinybar: 0n })).toThrow();
  });
});
