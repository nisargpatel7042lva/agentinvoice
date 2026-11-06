"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import type { Invoice } from "@agentinvoice/shared";
import { loadProfile, mintName, nameClaimMessage } from "@/app/actions";
import { toast } from "@/components/ToastHost";
import { Button, Card } from "@/components/ui";
import { formatAmount, shortHex } from "@/lib/format";

type Profile = Awaited<ReturnType<typeof loadProfile>>;
const input = "mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-accent";

export function ProfileView() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (address) setProfile(await loadProfile(address));
  }, [address]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function mint() {
    if (!address) return;
    setBusy(true);
    try {
      const clean = label.trim().toLowerCase();
      const msg = await nameClaimMessage(clean, address);
      if (!msg.ok || !msg.data) return toast("error", msg.message);
      const signature = await signMessageAsync({ message: msg.data.message });
      const r = await mintName(clean, address, signature);
      toast(r.ok ? "success" : "error", r.message);
      if (r.ok) await refresh();
    } catch {
      toast("error", "Signing was cancelled. Nothing was registered.");
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected || !address) {
    return <Card className="p-6 text-sm text-ink-soft">Connect your wallet (top right) to see your profile, your invoices and your ENS name.</Card>;
  }
  const mine = (profile?.invoices ?? []).filter((i: Invoice) => i.supplier.toLowerCase() === address.toLowerCase());
  const held = (profile?.invoices ?? []).filter((i: Invoice) => i.holder?.toLowerCase() === address.toLowerCase());

  return (
    <div className="grid gap-5">
      <Card className="grid gap-1 p-6">
        <span className="text-sm text-ink-muted">Wallet</span>
        <span className="font-mono text-sm">{address}</span>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold">Your ENS name</h2>
        {profile?.name ? (
          <p className="mt-2 text-sm">
            <a className="font-mono text-accent underline" href={`https://sepolia.app.ens.domains/${profile.name}`} target="_blank" rel="noreferrer">{profile.name}</a>
            <span className="text-ink-muted"> · a public identity on Sepolia that buyers and investors can look up.</span>
          </p>
        ) : profile?.canMint ? (
          <form className="mt-2 grid gap-3" onSubmit={(e) => { e.preventDefault(); void mint(); }}>
            <p className="text-sm text-ink-soft">Pick a name for your business. We register it for free on Sepolia and you sign one message to prove the wallet is yours.</p>
            <label className="block text-sm font-medium">
              Name
              <span className="mt-1.5 flex items-center gap-2">
                <input className={input + " mt-0"} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="acme-labs" autoComplete="off" />
                <span className="whitespace-nowrap font-mono text-xs text-ink-muted">.{profile.parent}</span>
              </span>
            </label>
            <Button type="submit" disabled={busy || label.trim().length < 3} aria-busy={busy}>{busy ? "Registering on Sepolia…" : "Get my ENS name"}</Button>
          </form>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Name registration is not available in this setup.</p>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold">Invoices you created ({mine.length})</h2>
        <InvoiceList items={mine} empty="None yet. Create one from the Supplier page." />
      </Card>
      <Card className="p-6">
        <h2 className="text-base font-semibold">Invoices you funded ({held.length})</h2>
        <InvoiceList items={held} empty="None yet. Fund one from the Market page." />
      </Card>
    </div>
  );
}

function InvoiceList({ items, empty }: { items: Invoice[]; empty: string }) {
  if (!items.length) return <p className="mt-2 text-sm text-ink-muted">{empty}</p>;
  return (
    <ul className="mt-2 divide-y divide-line text-sm">
      {items.map((i) => (
        <li key={i.id} className="flex items-center justify-between py-2">
          <Link className="text-accent underline" href={`/invoice/${i.id}`}>#{i.id}</Link>
          <span className="text-ink-soft">{formatAmount(i.faceAmount)} · {i.status} · {shortHex(i.buyerVault)}</span>
        </li>
      ))}
    </ul>
  );
}
