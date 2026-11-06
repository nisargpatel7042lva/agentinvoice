"use client";

import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { contracts, invoiceMarketAbi, isDeployed, tinybarToWeibar } from "@invoiceagent/shared";
import { toast } from "@/components/ToastHost";
import { Button } from "@/components/ui";
import { copy } from "@/lib/copy";
import { useChainTx } from "@/lib/useChainTx";
import { hederaTestnet } from "@/lib/wagmi";

/** The investor's main button: sends InvoiceMarket.fund(id) from the connected wallet with msg.value = price and waits for the receipt. */
export function FundButton({ id, price, priceLabel }: { id: string; price: string; priceLabel: string }) {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { send, busy } = useChainTx();
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


  function fundOnChain() {
    if (!isDeployed(contracts.invoiceMarket)) return toast("error", "The InvoiceMarket contract is not deployed yet.");
    return send({
      address: contracts.invoiceMarket,
      abi: invoiceMarketAbi,
      functionName: "fund",
      args: [BigInt(id)],
      value: tinybarToWeibar(price), // the contract stores tinybar; the Hedera relay takes weibar
      success: `Invoice #${id} funded. You are the holder.`,
    });
  }

  return (
    <Button size="lg" className={cls} disabled={busy} onClick={fundOnChain}>
      {busy ? "Confirm in your wallet…" : `Fund invoice for ${priceLabel}`}
    </Button>
  );
}
