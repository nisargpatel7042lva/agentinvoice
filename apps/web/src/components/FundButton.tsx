"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccount, useConnect, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { contracts, invoiceMarketAbi, isDeployed, tinybarToWeibar } from "@agentinvoice/shared";
import { fundInvoice } from "@/app/actions";
import { useAction } from "@/components/ActionButton";
import { toast } from "@/components/ToastHost";
import { Button } from "@/components/ui";
import { copy } from "@/lib/copy";
import { isMock } from "@/lib/env";
import { hederaTestnet, wagmiConfig } from "@/lib/wagmi";

/**
 * The investor's main button. Uses the real connected wallet.
 * - Real data (mock mode off): sends InvoiceMarket.fund(id) with msg.value = price, waits for the receipt.
 * - Demo data (mock mode on): records your address as holder in the demo store; no transaction, because demo invoice ids are not on-chain.
 */
export function FundButton({ id, price, priceLabel }: { id: string; price: string; priceLabel: string }) {
  const router = useRouter();
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { pending, run } = useAction();
  const [sending, setSending] = useState(false);
  const cls = "mt-4 w-full";

  if (!isConnected || !address) {
    const target = connectors.find((c) => c.id !== "injected") ?? connectors[0];
    return (
      <Button size="lg" className={cls} disabled={connecting} onClick={() => target && connect({ connector: target, chainId: hederaTestnet.id })}>
        {connecting ? "Check your wallet…" : copy.wallet.connectToFund}
      </Button>
    );
  }
  if (chainId !== hederaTestnet.id) {
    return (
      <Button size="lg" variant="outline" className={cls} disabled={switching} onClick={() => switchChain({ chainId: hederaTestnet.id })}>
        {switching ? "Switching…" : "Switch to Hedera testnet to fund"}
      </Button>
    );
  }

  if (isMock) {
    return (
      <>
        <Button size="lg" className={cls} disabled={pending} onClick={() => run(() => fundInvoice(id, address))}>
          {pending ? "Working…" : `Fund invoice for ${priceLabel}`}
        </Button>
        <p className="mt-2 text-center text-xs text-ink-muted">Demo data: this records your wallet as the holder. No HBAR moves.</p>
      </>
    );
  }

  async function fundOnChain() {
    if (!isDeployed(contracts.invoiceMarket)) return toast("error", "The InvoiceMarket contract is not deployed yet.");
    setSending(true);
    try {
      toast("pending", copy.toast.pending);
      const hash = await writeContractAsync({
        address: contracts.invoiceMarket,
        abi: invoiceMarketAbi,
        functionName: "fund",
        args: [BigInt(id)],
        value: tinybarToWeibar(price), // the contract stores tinybar; the Hedera relay takes weibar
        chainId: hederaTestnet.id,
      });
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: hederaTestnet.id });
      if (receipt.status !== "success") throw new Error("The transaction was reverted.");
      toast("success", `Invoice #${id} funded. ${copy.toast.viewTx}: ${hederaTestnet.blockExplorers.default.url}/transaction/${hash}`);
      router.refresh();
    } catch (e) {
      const m = (e as Error).message;
      toast("error", /rejected|denied/i.test(m) ? "You cancelled in your wallet. Nothing was sent." : /insufficient/i.test(m) ? "Your wallet does not have enough HBAR for this." : `Funding failed: ${m.split("\n")[0]}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <Button size="lg" className={cls} disabled={sending} onClick={fundOnChain}>
      {sending ? "Confirm in your wallet…" : `Fund invoice for ${priceLabel}`}
    </Button>
  );
}
