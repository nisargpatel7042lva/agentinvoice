"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { contracts, SETTLEMENT, settlementTokenAbi } from "@invoiceagent/shared";
import { hederaTestnet } from "@/lib/wagmi";

const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";

/**
 * The connected wallet's USDC position: balance, allowance for `spender` (the market by default), and whether the account can
 * receive USDC at all. On Hedera an account must be associated with a token first, unless it has free automatic association slots
 * (accounts created from an EVM wallet usually have unlimited ones). The association check reads Hedera's public Mirror node.
 */
export function useUsdc(spender: Address = contracts.invoiceMarket) {
  const { address } = useAccount();
  const enabled = Boolean(address);
  const balance = useReadContract({ address: contracts.usdc, abi: settlementTokenAbi, functionName: "balanceOf", args: address ? [address] : undefined, chainId: hederaTestnet.id, query: { enabled } });
  const allowance = useReadContract({ address: contracts.usdc, abi: settlementTokenAbi, functionName: "allowance", args: address ? [address, spender] : undefined, chainId: hederaTestnet.id, query: { enabled } });
  const [canReceive, setCanReceive] = useState<boolean | null>(null);

  const checkAssociation = useCallback(async () => {
    if (!address) return setCanReceive(null);
    try {
      const [tokens, account] = await Promise.all([
        fetch(`${MIRROR}/accounts/${address}/tokens?token.id=${SETTLEMENT.tokenId}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${MIRROR}/accounts/${address}`).then((r) => (r.ok ? r.json() : null)),
      ]);
      const associated = Array.isArray(tokens?.tokens) && tokens.tokens.length > 0;
      const auto = typeof account?.max_automatic_token_associations === "number" ? account.max_automatic_token_associations : 0;
      // -1 = unlimited automatic associations; >0 = some free slots (we cannot see how many are used, so treat as yes).
      setCanReceive(associated || auto === -1 || auto > 0);
    } catch {
      setCanReceive(null); // unknown: let the user try; the chain will refuse if it is not associated
    }
  }, [address]);

  useEffect(() => {
    void checkAssociation();
  }, [checkAssociation]);

  const refresh = useCallback(async () => {
    await Promise.all([balance.refetch(), allowance.refetch(), checkAssociation()]);
  }, [balance, allowance, checkAssociation]);

  return {
    address,
    balance: (balance.data as bigint | undefined) ?? 0n,
    allowance: (allowance.data as bigint | undefined) ?? 0n,
    loaded: balance.isFetched && allowance.isFetched,
    canReceive,
    refresh,
  };
}
