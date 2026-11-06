/**
 * Prepare and execute HBAR→USDC via SaucerSwap V2 SwapRouter multicall(exactInput, refundETH).
 * Execute uses @hashgraph/sdk ContractExecuteTransaction (docs pattern).
 * DRY_RUN / config.dryRun never broadcasts.
 *
 * Source: https://docs.saucerswap.finance/developers/v2/swap/swap-hbar-for-tokens
 */
import { decodeFunctionResult, encodeFunctionData, type Hex } from "viem";
import { swapRouterAbi } from "./abi";
import { checkHbarAffordability, getHbarBalance, getTokenBalance, isTokenAssociated } from "./balance";
import { hederaIdToEvmAddress, USDC_TOKEN_ID, V2_SWAP_ROUTER_ID } from "./config";
import { validateQuote } from "./quote";
import type {
  BroadcastResult,
  ExecuteRequest,
  ExecuteResult,
  PreparedSwap,
  SaucerSwapConfig,
  SaucerSwapDeps,
  SaucerSwapErrorCode,
  SwapQuote,
} from "./types";

function fail(code: SaucerSwapErrorCode, reason: string, transactionId?: string): ExecuteResult {
  return transactionId ? { ok: false, code, reason, transactionId } : { ok: false, code, reason };
}

function hexToBytes(hex: Hex): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error("odd-length hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Read amountOut from the router's multicall return value (bytes[]: results[0] is exactInput's uint256).
 * Returns undefined when the data can't be decoded; callers then rely on the verified balance change.
 */
export function decodeMulticallAmountOut(data: Hex): bigint | undefined {
  try {
    const results = decodeFunctionResult({ abi: swapRouterAbi, functionName: "multicall", data });
    const first = results[0];
    if (!first) return undefined;
    return decodeFunctionResult({ abi: swapRouterAbi, functionName: "exactInput", data: first });
  } catch {
    return undefined;
  }
}

/** Encode payable multicall(exactInput + refundETH) for the V2 router. */
export function encodeExactInputMulticall(args: {
  path: `0x${string}`;
  recipientEvm: `0x${string}`;
  deadline: number;
  amountIn: bigint;
  amountOutMinimum: bigint;
}): Uint8Array {
  const swapEncoded = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "exactInput",
    args: [
      {
        path: args.path,
        recipient: args.recipientEvm,
        deadline: BigInt(args.deadline),
        amountIn: args.amountIn,
        amountOutMinimum: args.amountOutMinimum,
      },
    ],
  });
  const refundEncoded = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "refundETH",
  });
  const multicall = encodeFunctionData({
    abi: swapRouterAbi,
    functionName: "multicall",
    args: [[swapEncoded, refundEncoded]],
  });
  return hexToBytes(multicall);
}

export function prepareSwap(
  quote: SwapQuote,
  config: SaucerSwapConfig,
  recipientAccountId: string,
  deps: SaucerSwapDeps = {},
): PreparedSwap {
  const nowSec = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  const deadline = nowSec + config.deadlineSeconds;
  const recipientEvmAddress = hederaIdToEvmAddress(recipientAccountId);
  return {
    routerContractId: quote.routerContractId || V2_SWAP_ROUTER_ID,
    payableTinybar: quote.amountInTinybar,
    gasLimit: config.gasLimit,
    functionParameters: encodeExactInputMulticall({
      path: quote.path,
      recipientEvm: recipientEvmAddress,
      deadline,
      amountIn: quote.amountInTinybar,
      amountOutMinimum: quote.amountOutMinimum,
    }),
    quote,
    recipientAccountId,
    recipientEvmAddress,
    deadline,
  };
}

/**
 * Default broadcast via @hashgraph/sdk. Dynamic import keeps quote-only paths lighter.
 * Never logs the private key.
 */
export async function defaultBroadcast(prepared: PreparedSwap, config: SaucerSwapConfig): Promise<BroadcastResult> {
  if (!config.operatorAccountId || !config.operatorPrivateKey) {
    return { status: "failed", reason: "No swap operator configured" };
  }
  try {
    const { Client, ContractExecuteTransaction, ContractId, Hbar, HbarUnit, PrivateKey } = await import("@hashgraph/sdk");
    let key: InstanceType<typeof PrivateKey>;
    try {
      key = PrivateKey.fromStringECDSA(config.operatorPrivateKey.replace(/^0x/, ""));
    } catch {
      key = PrivateKey.fromString(config.operatorPrivateKey);
    }
    const client = Client.forTestnet().setOperator(config.operatorAccountId, key);
    try {
      const tx = await new ContractExecuteTransaction()
        .setContractId(ContractId.fromString(prepared.routerContractId))
        .setGas(prepared.gasLimit)
        .setPayableAmount(Hbar.from(prepared.payableTinybar.toString(), HbarUnit.Tinybar))
        .setFunctionParameters(prepared.functionParameters)
        .execute(client);

      const txId = tx.transactionId?.toString();
      let record;
      try {
        record = await tx.getRecord(client);
      } catch (e) {
        // Submitted but receipt/record unknown — do NOT retry blindly.
        return {
          status: "uncertain",
          transactionId: txId,
          reason: `Broadcast submitted but record unavailable: ${(e as Error).message}`,
        };
      }

      const receiptStatus = record.receipt?.status?.toString?.() ?? "";
      if (receiptStatus && receiptStatus !== "SUCCESS") {
        return {
          status: "failed",
          transactionId: txId,
          reason: `Contract execute status ${receiptStatus}`,
        };
      }

      // The router call is multicall(...), which returns bytes[]; the swap's amountOut is inside results[0].
      const raw = record.contractFunctionResult?.bytes;
      const amountOut = raw ? decodeMulticallAmountOut(("0x" + Buffer.from(raw).toString("hex")) as Hex) : undefined;

      return { status: "success", transactionId: txId, amountOut };
    } finally {
      client.close();
    }
  } catch (e) {
    return { status: "failed", reason: `Broadcast failed: ${(e as Error).message}` };
  }
}

async function defaultWaitForConfirmation(
  transactionId: string,
  config: SaucerSwapConfig,
  deps: SaucerSwapDeps,
): Promise<boolean> {
  const f = deps.fetch ?? fetch;
  // Mirror eventually-consistent; single lookup is enough for mocked tests / best-effort verify.
  const encoded = encodeURIComponent(transactionId);
  const res = await f(`${config.mirrorNodeUrl}/api/v1/transactions/${encoded}`);
  if (!res.ok) return false;
  const json = (await res.json()) as { transactions?: Array<{ result?: string }> };
  const result = json.transactions?.[0]?.result;
  return result === "SUCCESS";
}

/**
 * Execute a previously obtained quote. Requires a valid, non-stale quote.
 * When dryRun (config or request), returns prepared calldata and never broadcasts.
 */
export async function executeHbarToUsdc(
  request: ExecuteRequest,
  config: SaucerSwapConfig,
  deps: SaucerSwapDeps = {},
): Promise<ExecuteResult> {
  if (config.network !== "testnet") {
    return fail("MAINNET_REJECTED", "SaucerSwap library rejects mainnet; testnet only");
  }

  const validated = validateQuote(request.quote, config, deps);
  if (!validated.ok) return fail(validated.code, validated.reason);

  const quote = validated.quote;
  const dryRun = config.dryRun || request.dryRun === true;

  if (!config.operatorAccountId) {
    // Quote-only / dry-run may still prepare without a key when an account id is supplied via deps later;
    // live execute always needs the dedicated operator pair.
    if (!dryRun) return fail("NO_OPERATOR", "Set SAUCERSWAP_OPERATOR_ACCOUNT_ID and SAUCERSWAP_OPERATOR_PRIVATE_KEY");
  }

  const accountId = config.operatorAccountId;
  if (!accountId) {
    // dry-run without operator: still allow preparing against a placeholder recipient of "0.0.0" is wrong.
    // Require account id even for dry-run so path/recipient encoding is meaningful.
    return fail("NO_OPERATOR", "Set SAUCERSWAP_OPERATOR_ACCOUNT_ID to prepare or execute a swap");
  }

  const associated = await isTokenAssociated(accountId, quote.tokenOut || USDC_TOKEN_ID, config, deps);
  if (!associated) {
    return fail("NOT_ASSOCIATED", `Account ${accountId} must associate USDC ${quote.tokenOut} before swap`);
  }

  const hbarBalance = await getHbarBalance(accountId, config, deps);
  const afford = checkHbarAffordability(hbarBalance, quote.amountInTinybar, config.gasReserveTinybar);
  if (!afford.ok) return fail(afford.code, afford.reason);

  const prepared = prepareSwap(quote, config, accountId, deps);

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      prepared,
      reason: "DRY_RUN: swap prepared but not broadcast",
    };
  }

  if (!config.operatorPrivateKey) {
    return fail("NO_OPERATOR", "Set SAUCERSWAP_OPERATOR_PRIVATE_KEY to broadcast a swap");
  }

  const usdcBefore = await getTokenBalance(accountId, quote.tokenOut, config, deps);
  const broadcast = deps.broadcast ?? defaultBroadcast;
  const result = await broadcast(prepared, config);

  if (result.status === "uncertain") {
    // Never blind-retry after uncertain broadcast.
    return fail(
      "BROADCAST_UNCERTAIN",
      result.reason ?? "Broadcast outcome uncertain; not retrying",
      result.transactionId,
    );
  }
  if (result.status !== "success" || !result.transactionId) {
    return fail("BROADCAST_FAILED", result.reason ?? "Broadcast failed", result.transactionId);
  }

  const wait = deps.waitForConfirmation ?? ((txId: string, cfg: SaucerSwapConfig) => defaultWaitForConfirmation(txId, cfg, deps));
  const confirmed = await wait(result.transactionId, config);
  if (!confirmed) {
    return fail(
      "CONFIRMATION_FAILED",
      `Transaction ${result.transactionId} was not confirmed SUCCESS on Mirror`,
      result.transactionId,
    );
  }

  const usdcAfter = await getTokenBalance(accountId, quote.tokenOut, config, deps);
  const gained = usdcAfter - usdcBefore;
  if (gained < quote.amountOutMinimum) {
    return fail(
      "USDC_VERIFY_FAILED",
      `USDC balance increased by ${gained}, below amountOutMinimum ${quote.amountOutMinimum}`,
      result.transactionId,
    );
  }

  return {
    ok: true,
    dryRun: false,
    transactionId: result.transactionId,
    amountOut: result.amountOut ?? gained,
    usdcBalanceBefore: usdcBefore,
    usdcBalanceAfter: usdcAfter,
  };
}
