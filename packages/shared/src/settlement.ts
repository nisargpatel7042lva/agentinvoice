/**
 * The settlement asset: every invoice payment (investor -> supplier, buyer vault -> holder) moves USDC, not HBAR.
 * USDC here is SaucerSwap's testnet USDC (HTS 0.0.5449, 6 decimals): the token people get by swapping HBAR on SaucerSwap.
 * Safe for the web bundle: viem only, no Hedera SDK.
 *
 * Amounts in invoices, vault limits and the credit score are USDC base units (1 USDC = 1_000_000).
 * HBAR still pays gas, x402 score fees, and is what gets swapped into USDC.
 */
import { encodeFunctionData, type Address, type Hex } from "viem";
import { swapRouterAbi } from "./saucerswap/abi";
import { DEFAULT_POOL_FEE, encodeV3Path, hederaIdToEvmAddress, V2_SWAP_ROUTER_ID, WHBAR_TOKEN_ID } from "./saucerswap/config";
import { formatUnits, parseUnits } from "./units";

export const SETTLEMENT = {
  symbol: "USDC",
  decimals: 6,
  tokenId: "0.0.5449",
  /** The token's long-zero EVM address; HTS tokens answer ERC-20 calls here. */
  address: hederaIdToEvmAddress("0.0.5449") as Address,
} as const;

/** "12.5" -> 12_500_000n (USDC base units). Rejects more than 6 decimals. */
export function parseAmount(value: string): bigint {
  return parseUnits(value, SETTLEMENT.decimals);
}

/** 12_500_000n -> "12.5". */
export function formatAmountUnits(amount: bigint | string): string {
  return formatUnits(amount, SETTLEMENT.decimals);
}

/** USDC base units as a plain number of USDC (for charts and sums; not for exact money math). */
export function amountToNumber(amount: bigint | string): number {
  return Number(formatAmountUnits(amount));
}

/** ERC-20 subset plus HIP-719 associate(): what wallets and agents need to hold, approve and send USDC on Hedera. */
export const settlementTokenAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  // HIP-719: the caller associates itself with this token (required before it can receive USDC on Hedera).
  { type: "function", name: "associate", stateMutability: "nonpayable", inputs: [], outputs: [{ name: "responseCode", type: "uint256" }] },
] as const;

/** SaucerSwap V2 router, as an EVM address a wallet can send to. */
export const SAUCERSWAP_ROUTER = hederaIdToEvmAddress(V2_SWAP_ROUTER_ID) as Address;

export interface HbarToUsdcSwapTx {
  to: Address;
  data: Hex;
  /** HBAR to send with the call, in tinybar. Over JSON-RPC send tinybarToWeibar(valueTinybar). */
  valueTinybar: bigint;
}

/**
 * The transaction that swaps `amountInTinybar` HBAR for at least `amountOutMinimum` USDC and delivers it to `recipient`
 * (a wallet, or a BuyerVault so the agent tops the vault up directly). multicall(exactInput, refundETH) is SaucerSwap's
 * documented pattern for HBAR in; refundETH returns any unused HBAR to the sender. Get amountOutMinimum from a quote.
 */
export function buildHbarToUsdcSwap(args: { amountInTinybar: bigint; amountOutMinimum: bigint; recipient: Address; deadline: number; fee?: number }): HbarToUsdcSwapTx {
  if (args.amountInTinybar <= 0n) throw new Error("amountInTinybar must be positive");
  if (args.amountOutMinimum <= 0n) throw new Error("amountOutMinimum must be positive: always swap against a quote");
  const swap = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "exactInput",
    args: [
      {
        path: encodeV3Path(WHBAR_TOKEN_ID, args.fee ?? DEFAULT_POOL_FEE, SETTLEMENT.tokenId),
        recipient: args.recipient,
        deadline: BigInt(args.deadline),
        amountIn: args.amountInTinybar,
        amountOutMinimum: args.amountOutMinimum,
      },
    ],
  });
  const refund = encodeFunctionData({ abi: swapRouterAbi, functionName: "refundETH" });
  const data = encodeFunctionData({ abi: swapRouterAbi, functionName: "multicall", args: [[swap, refund]] });
  return { to: SAUCERSWAP_ROUTER, data, valueTinybar: args.amountInTinybar };
}

/** USDC needed beyond what is held, or 0n. */
export function shortfall(have: bigint, need: bigint): bigint {
  return have >= need ? 0n : need - have;
}
