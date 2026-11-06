"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Abi, Address } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { getPublicClient, waitForTransactionReceipt } from "wagmi/actions";
import { toast } from "@/components/ToastHost";
import { hederaTestnet, wagmiConfig } from "@/lib/wagmi";

const MIN_GAS = 100_000n;

/** Turns wallet and contract errors into a sentence a person can act on. */
export function explainTxError(e: unknown): string {
  const m = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? "Unknown error";
  if (/rejected|denied/i.test(m)) return "You cancelled in your wallet. Nothing was sent.";
  if (/insufficient/i.test(m)) return "Your wallet does not have enough HBAR (testnet HBAR is free at portal.hedera.com).";
  const custom = m.match(/reverted with the following reason:\s*\n?\s*([^\n]+)|Error: ([A-Za-z]+)\(\)/);
  if (custom) return `The contract refused: ${custom[1] ?? custom[2]}.`;
  return m.split("\n")[0];
}

/**
 * Sends one contract call from the connected wallet, waits for the receipt, shows toasts with the HashScan link,
 * then refreshes the page. The backend indexer picks up the event within a few seconds, so we refresh twice.
 */
export function useChainTx() {
  const router = useRouter();
  const { writeContractAsync } = useWriteContract();
  const { address: account } = useAccount();
  const [busy, setBusy] = useState(false);

  async function send(args: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint; success: string }) {
    setBusy(true);
    try {
      toast("pending", "Confirm in your wallet, then wait for the network…");
      // Hedera under-estimates calls that send HBAR out of a contract (claim ran out of gas at the estimate), so use
      // twice the estimate and at least 100,000. If the estimate itself fails, send without a limit and let the wallet report it.
      const call = { address: args.address, abi: args.abi, functionName: args.functionName, args: args.args ?? [], value: args.value, chainId: hederaTestnet.id };
      const estimate = await getPublicClient(wagmiConfig, { chainId: hederaTestnet.id })
        ?.estimateContractGas({ address: call.address, abi: call.abi, functionName: call.functionName, args: call.args, value: call.value, account })
        .catch(() => null);
      const gas = estimate == null ? undefined : estimate * 2n > MIN_GAS ? estimate * 2n : MIN_GAS;
      const hash = await writeContractAsync({ ...call, gas });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: hederaTestnet.id });
      if (receipt.status !== "success") throw new Error("The transaction was reverted.");
      toast("success", `${args.success} View on HashScan: ${hederaTestnet.blockExplorers.default.url}/transaction/${hash}`);
      router.refresh();
      setTimeout(() => router.refresh(), 5000);
      return hash;
    } catch (e) {
      toast("error", explainTxError(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { send, busy };
}
