"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useBalance, useSignMessage } from "wagmi";
import { formatUnits } from "viem";
import { ArrowUpRight, FilePlus2, LayoutList } from "lucide-react";
import type { Invoice, Status } from "@invoiceagent/shared";
import { loadProfile, mintName, nameClaimMessage, roleMessage, setRole, type Role } from "@/app/actions";
import { BuyerSetup } from "@/components/BuyerSetup";
import { Banner } from "@/components/Banner";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "@/components/ToastHost";
import { WalletButton } from "@/components/WalletButton";
import { Button, buttonVariants, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatAmount, formatDate, shortHex } from "@/lib/format";
import { hederaTestnet } from "@/lib/wagmi";

type Profile = Awaited<ReturnType<typeof loadProfile>>;
const input = "mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-accent";
const d = (n: number) => ({ ["--d" as string]: n + "s" });

const TITLE = (
  <>
    Your wallet,
    <br />
    <em>your invoices.</em>
  </>
);

export function ProfileView() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { data: balance } = useBalance({ address, chainId: hederaTestnet.id, query: { enabled: !!address } });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [roleBusy, setRoleBusy] = useState<Role | null>(null);

  const refresh = useCallback(async () => {
    if (address) setProfile(await loadProfile(address));
  }, [address]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function chooseRole(role: Role) {
    if (!address) return;
    setRoleBusy(role);
    try {
      const msg = await roleMessage(role, address);
      if (!msg.ok || !msg.data) return toast("error", msg.message);
      let signature: string;
      try {
        signature = await signMessageAsync({ message: msg.data.message });
      } catch {
        return toast("error", "Signing was cancelled. Nothing was saved.");
      }
      const r = await setRole(role, address, signature);
      toast(r.ok ? "success" : "error", r.message);
      await refresh();
    } finally {
      setRoleBusy(null);
    }
  }

  async function mint() {
    if (!address) return;
    setBusy(true);
    try {
      const clean = label.trim().toLowerCase();
      const msg = await nameClaimMessage(clean, address);
      if (!msg.ok || !msg.data) return toast("error", msg.message);
      let signature: string;
      try {
        signature = await signMessageAsync({ message: msg.data.message });
      } catch {
        return toast("error", "Signing was cancelled. Nothing was registered.");
      }
      try {
        const r = await mintName(clean, address, signature);
        toast(r.ok ? "success" : "error", r.message);
      } catch {
        // The server may have been cut off while the registration still finished, so check before saying it failed.
        toast("error", "The registration took too long to confirm. Checking your profile now…");
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected || !address) {
    return (
      <Banner
        hue="sage"
        eyebrow="Profile"
        title={TITLE}
        sub="Connect a wallet to see your ENS name, the invoices you created and the ones you funded."
        action={<WalletButton />}
        cards={
          <div className="pl-card pl-dark flex flex-col gap-3 p-6 opacity-90" style={d(0.1)}>
            <span className="pl-k">Wallet</span>
            <span className="pl-serif text-4xl leading-none">not connected</span>
            <span className="font-mono text-xs text-white/50">0x···· ····</span>
          </div>
        }
      />
    );
  }

  const mine = (profile?.invoices ?? []).filter((i: Invoice) => i.supplier.toLowerCase() === address.toLowerCase());
  const held = (profile?.invoices ?? []).filter((i: Invoice) => i.holder?.toLowerCase() === address.toLowerCase());
  const hbar = balance ? Number(formatUnits(balance.value, balance.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—";

  return (
    <div className="flex flex-col gap-8">
      <Banner
        hue="sage"
        eyebrow="Profile"
        title={TITLE}
        sub="Your public name, the invoices you sold and the ones you funded, in one place."
        action={
          <>
            <Link href="/supplier" className={buttonVariants({ size: "lg" })}>
              <FilePlus2 aria-hidden="true" />
              Create invoice
            </Link>
            <Link href="/market" className={buttonVariants({ variant: "ghost", size: "lg", className: "text-[#161513] hover:bg-white/40" })}>
              <LayoutList aria-hidden="true" />
              Fund one
            </Link>
          </>
        }
        cards={
          <div className="grid grid-cols-2 gap-3">
            <div className="pl-card pl-dark col-span-2 flex flex-col gap-4 p-6" style={d(0.1)}>
              <span className="flex items-center justify-between text-xs text-white/60">
                <span>Hedera testnet</span>
                <span className="font-mono">{shortHex(address)}</span>
              </span>
              <span className="pl-serif truncate text-[40px] leading-none">{profile?.name ?? "no name yet"}</span>
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-white/60">Balance</span>
                <span className="text-xl font-semibold">{hbar} HBAR</span>
              </span>
            </div>
            <div className="pl-card pl-coral" style={d(0.25)}>
              <span className="pl-k">You created</span>
              <span className="pl-big mt-1 block">{mine.length}</span>
            </div>
            <div className="pl-card pl-glass" style={d(0.35)}>
              <span className="pl-k">You funded</span>
              <span className="pl-big mt-1 block">{held.length}</span>
            </div>
          </div>
        }
      />

      {profile && !profile.role && profile.canMint && (
        <Card className="p-6">
          <h2 className="text-base font-semibold">
            How will you use <span className="pl-serif text-accent">Invoice Agent</span>?
          </h2>
          <p className="mt-2 max-w-xl text-sm text-ink-soft">Choose once. A wallet is either a seller or a buyer, and the choice cannot be changed. You sign one message to confirm it.</p>
          <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-2">
            <button type="button" disabled={roleBusy !== null} onClick={() => void chooseRole("seller")} className="pl-lift rounded-xl border border-line bg-surface p-4 text-left disabled:opacity-60">
              <span className="block font-semibold">{roleBusy === "seller" ? "Waiting for your signature…" : "I'm a seller"}</span>
              <span className="mt-1 block text-sm text-ink-muted">I'm owed money by an agent and want to be paid today.</span>
            </button>
            <button type="button" disabled={roleBusy !== null} onClick={() => void chooseRole("buyer")} className="pl-lift rounded-xl border border-line bg-surface p-4 text-left disabled:opacity-60">
              <span className="block font-semibold">{roleBusy === "buyer" ? "Waiting for your signature…" : "I'm a buyer"}</span>
              <span className="mt-1 block text-sm text-ink-muted">I run an agent that owes suppliers and pays from a vault.</span>
            </button>
          </div>
        </Card>
      )}
      {profile?.role === "buyer" && !profile.name && profile.parent && <BuyerSetup parent={profile.parent} onDone={refresh} />}
      {profile?.role === "buyer" && profile.name && (
        <p className="-mt-4 text-sm text-ink-muted">
          Your agent is <span className="font-mono text-ink">{profile.name}</span>, paying from vault <span className="font-mono text-ink">{profile.vault ? shortHex(profile.vault) : ""}</span>. Fund the vault with HBAR so it can pay invoices.
        </p>
      )}
      {profile?.role === "seller" && !profile.name && (
        <Card className="p-6">
          <h2 className="text-base font-semibold">
            Claim your <span className="pl-serif text-accent">ENS name</span>
          </h2>
          {profile?.canMint ? (
            <form className="mt-2 grid max-w-xl gap-3" onSubmit={(e) => { e.preventDefault(); void mint(); }}>
              <p className="text-sm text-ink-soft">Pick a name for your business. We register it for free on Sepolia and you sign one message to prove the wallet is yours.</p>
              <label className="block text-sm font-medium">
                Name
                <span className="mt-1.5 flex items-center gap-2">
                  <input className={input + " mt-0"} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="acme-labs" autoComplete="off" />
                  <span className="whitespace-nowrap font-mono text-xs text-ink-muted">.{profile.parent}</span>
                </span>
              </label>
              <Button type="submit" className="w-fit" disabled={busy || label.trim().length < 3} aria-busy={busy}>{busy ? "Registering on Sepolia…" : "Get my ENS name"}</Button>
            </form>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">Name registration is not available in this setup.</p>
          )}
        </Card>
      )}
      {profile?.role === "seller" && profile.name && (
        <p className="-mt-4 text-sm text-ink-muted">
          Your public name is{" "}
          <a className="inline-flex items-center gap-0.5 font-mono text-accent" href={"https://sepolia.app.ens.domains/" + profile.name} target="_blank" rel="noreferrer">
            {profile.name} <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </a>
          , so buyers and investors can look you up.
        </p>
      )}

      <InvoiceGrid title="Invoices you created" items={mine} empty="None yet." emptyHref="/supplier" emptyLabel="Create your first invoice" />
      <InvoiceGrid title="Invoices you funded" items={held} empty="None yet." emptyHref="/market" emptyLabel="Find one to fund" />
    </div>
  );
}

const STEPS: Status[] = ["Pending", "Open", "Funded", "Paid"];

function InvoiceGrid({ title, items, empty, emptyHref, emptyLabel }: { title: string; items: Invoice[]; empty: string; emptyHref: string; emptyLabel: string }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-[-0.02em]">
        {title} <span className="text-ink-muted">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line bg-surface px-5 py-6 text-sm text-ink-muted">
          {empty}
          <Link href={emptyHref} className={buttonVariants({ variant: "outline", size: "sm" })}>{emptyLabel}</Link>
        </div>
      ) : (
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => {
            const bad = i.status === "Late" || i.status === "Defaulted";
            const at = bad ? 2 : STEPS.indexOf(i.status);
            return (
              <li key={i.id}>
                <Link href={"/invoice/" + i.id} className="pl-lift flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-ink-muted">#{i.id}</span>
                    <StatusBadge status={i.status} />
                  </span>
                  <span className="text-2xl font-semibold tracking-[-0.03em]">{formatAmount(i.faceAmount)}</span>
                  <span className="text-[13px] text-ink-muted">Due {formatDate(i.dueDate)} · {shortHex(i.buyerVault)}</span>
                  <span aria-hidden="true" className="mt-auto grid grid-cols-4 gap-1 pt-2">
                    {STEPS.map((s, n) => (
                      <span key={s} className={cn("h-1 rounded-full", n <= at ? (bad && n === at ? "bg-warn" : "bg-hot") : "bg-subtle")} />
                    ))}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
