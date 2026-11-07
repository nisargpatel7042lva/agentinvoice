"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { Card } from "@/components/ui";
import { UsdcSwap } from "@/components/UsdcSwap";

/** Two ways to get USDC: into your own wallet (to fund invoices), or straight into a buyer vault (so the agent can pay suppliers). */
export function TreasurySwaps() {
  const [vault, setVault] = useState("");
  const validVault = isAddress(vault.trim()) ? (vault.trim() as `0x${string}`) : undefined;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">
          USDC for <span className="pl-serif text-accent">your wallet</span>
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">To fund invoices. Funding pays the supplier the price in USDC from this wallet.</p>
        <UsdcSwap />
      </Card>
      <Card className="p-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">
          Top up a <span className="pl-serif text-accent">buyer vault</span>
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">Swap HBAR and deliver the USDC straight into the vault the buyer agent pays suppliers from.</p>
        <label className="text-sm font-medium" htmlFor="vault-address">
          Vault address
        </label>
        <input
          id="vault-address"
          value={vault}
          onChange={(e) => setVault(e.target.value)}
          placeholder="0x…"
          className="mt-1.5 mb-4 h-11 w-full rounded-xl border border-line bg-surface px-3 font-mono text-sm outline-none focus:outline-2 focus:outline-accent"
        />
        {validVault ? <UsdcSwap recipient={validVault} suggestHbar="10" /> : <p className="text-sm text-ink-muted">Paste the vault address to continue.</p>}
      </Card>
    </div>
  );
}
