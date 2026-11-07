"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Copy, ExternalLink, LogOut, TriangleAlert, Wallet } from "lucide-react";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { formatUnits } from "viem";
import { Button, buttonVariants } from "@/components/ui";
import { toast } from "@/components/ToastHost";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import { shortHex } from "@/lib/format";
import { hederaTestnet } from "@/lib/wagmi";
import { useUsdc } from "@/lib/useUsdc";
import { formatAmountUnits } from "@invoiceagent/shared";

/** Real wallet connection: browser wallets on Hedera testnet. */
export function WalletButton() {
  const { address, chainId, isConnected, isConnecting, isReconnecting } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { data: balance } = useBalance({ address, chainId: hederaTestnet.id, query: { enabled: !!address } });
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // Wallet state only exists in the browser; render a stable placeholder on the server.
  if (!mounted || isReconnecting) {
    return <span aria-hidden="true" className="h-9 w-36 animate-pulse rounded-lg bg-subtle" />;
  }

  if (!isConnected || !address) {
    // Every wallet found through EIP-6963 is offered; the generic "Injected" entry is only a fallback.
    const discovered = connectors.filter((c) => c.id !== "injected");
    const wallets = discovered.length > 0 ? discovered : connectors;
    const noWallet = typeof window !== "undefined" && !("ethereum" in window) && discovered.length === 0;
    if (noWallet) {
      return (
        <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className={buttonVariants({ variant: "dark", size: "sm", className: "h-9" })}>
          <Wallet aria-hidden="true" />
          Get a wallet
        </a>
      );
    }
    return (
      <div ref={menu} className="relative">
        <Button variant="dark" size="sm" className="h-9" aria-haspopup="menu" aria-expanded={open} disabled={isPending || isConnecting} onClick={() => setOpen((o) => !o)}>
          <Wallet aria-hidden="true" />
          {isPending || isConnecting ? "Check your wallet…" : copy.wallet.connect}
        </Button>
        {open && (
          <Floating anchor={menu} panel={panel}>
            <div className="px-3 py-2 text-xs text-ink-muted">Choose a wallet</div>
            {wallets.map((c) => (
              <button
                key={c.uid}
                role="menuitem"
                type="button"
                className={item}
                onClick={() => {
                  setOpen(false);
                  connect(
                    { connector: c, chainId: hederaTestnet.id },
                    { onError: (e) => toast("error", e.message.includes("rejected") ? "You cancelled in your wallet." : `Could not connect: ${e.message.split("\n")[0]}`) },
                  );
                }}
              >
                {c.icon ? <img src={c.icon} alt="" className="size-5 rounded" /> : <Wallet aria-hidden="true" className="size-4" />}
                {c.id === "injected" ? "Browser wallet" : c.name}
              </button>
            ))}
          </Floating>
        )}
      </div>
    );
  }

  if (chainId !== hederaTestnet.id) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-9 border-status-late text-status-late"
        disabled={switching}
        onClick={() => switchChain({ chainId: hederaTestnet.id }, { onError: (e) => toast("error", `Could not switch network: ${e.message.split("\n")[0]}`) })}
      >
        <TriangleAlert aria-hidden="true" />
        {switching ? "Switching…" : "Switch to Hedera testnet"}
      </Button>
    );
  }

  return (
    <div ref={menu} className="relative">
      <Button variant="outline" size="sm" className="h-9 font-mono" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true" className="size-1.5 rounded-full bg-good" />
        {shortHex(address)}
        <ChevronDown aria-hidden="true" className="text-ink-muted" />
      </Button>
      {open && (
        <Floating anchor={menu} panel={panel}>
          <div className="px-3 py-2">
            <div className="text-xs text-ink-muted">Connected on Hedera testnet</div>
            <div className="mt-0.5 truncate font-mono text-sm">{address}</div>
            {balance && <div className="mt-1 text-sm font-semibold">{Number(formatUnits(balance.value, balance.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 })} HBAR</div>}
            <UsdcBalanceLine />
          </div>
          <div className="my-1 border-t border-subtle" />
          <button role="menuitem" type="button" onClick={() => { navigator.clipboard?.writeText(address); toast("success", "Address copied."); setOpen(false); }} className={item}>
            <Copy aria-hidden="true" className="size-4" /> Copy address
          </button>
          <a role="menuitem" href={`${hederaTestnet.blockExplorers.default.url}/account/${address}`} target="_blank" rel="noreferrer" className={item}>
            <ExternalLink aria-hidden="true" className="size-4" /> View on HashScan
          </a>
          <button role="menuitem" type="button" onClick={() => { disconnect(); setOpen(false); }} className={cn(item, "text-danger")}>
            <LogOut aria-hidden="true" className="size-4" /> Disconnect
          </button>
        </Floating>
      )}
    </div>
  );
}

const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-soft hover:bg-subtle hover:text-ink";

/**
 * The dropdown panel, drawn on document.body so no parent with overflow:hidden (like a page banner) can clip it.
 * It sits under the button, right-aligned, and follows it on scroll and resize.
 */
function Floating({ anchor, panel, children }: { anchor: React.RefObject<HTMLDivElement | null>; panel: React.RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);
  if (!pos) return null;
  return createPortal(
    <div
      ref={panel}
      role="menu"
      style={{ position: "fixed", top: pos.top, right: pos.right }}
      className="z-[70] w-64 max-w-[calc(100vw-16px)] rounded-xl border border-line bg-surface p-2 text-ink shadow-raised"
    >
      {children}
    </div>,
    document.body,
  );
}

/** The wallet's USDC (what invoices settle in), under its HBAR balance. */
function UsdcBalanceLine() {
  const usdc = useUsdc();
  if (!usdc.loaded) return null;
  return <div className="text-sm font-semibold">{Number(formatAmountUnits(usdc.balance)).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC</div>;
}
