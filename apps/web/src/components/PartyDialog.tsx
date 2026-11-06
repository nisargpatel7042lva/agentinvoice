"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowUpRight, BadgeCheck, Copy, X } from "lucide-react";
import { hederaTestnet } from "@invoiceagent/shared";
import type { GraphLink, GraphNode, Health } from "@/lib/graph";
import { toast } from "@/components/ToastHost";
import { formatHbar, shortHex } from "@/lib/format";

export const ROLE_LABEL = { buyer: "Buyer agent", supplier: "Supplier", investor: "Investor", sponsor: "Sponsor" } as const;
// Same hues as the graph and the landing page.
export const ROLE_COLOR = { buyer: "#f26b3a", supplier: "#f9cba9", investor: "#9fd49f", sponsor: "#d9b3e6" } as const;
export const HEALTH_COLOR: Record<Health, string> = { good: "#7cc488", late: "#ecc94b", default: "#f0645a", open: "#8a867d" };
const HEALTH_LABEL: Record<Health, string> = { good: "Paid on time", late: "Has late payments", default: "Has a default", open: "Not settled yet" };

// Names live on ENSv2 on Sepolia; the ENS app shows owner, resolver, records and expiry for each one.
const ensApp = (name: string) => "https://sepolia.app.ens.domains/" + encodeURIComponent(name);
const etherscan = (addr: string) => "https://sepolia.etherscan.io/address/" + addr;
const hashscan = (addr: string) => hederaTestnet.explorerUrl + "/address/" + addr;

function VerifyLink({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-accent">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block truncate font-mono text-[11.5px] text-ink-muted">{sub}</span>
      </span>
      <ArrowUpRight aria-hidden="true" className="size-4 flex-none text-ink-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
    </a>
  );
}

/** A window for one party in the network: who they are, their connections, and links to verify it all on ENS and the explorers. */
export function PartyDialog({ node, links, nameOf, onClose }: { node: GraphNode; links: GraphLink[]; nameOf: (id: string) => string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const hasEns = node.name.endsWith(".eth");
  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text);
    toast("success", what + " copied.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6" role="presentation">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-[#161513]/55 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="party-title"
        className="pl-card relative flex max-h-[min(720px,calc(100vh-24px))] w-full max-w-lg flex-col overflow-hidden border border-line bg-canvas p-0 text-ink"
      >
        <div className="flex items-start gap-4 border-b border-line px-6 pt-6 pb-5">
          <span aria-hidden="true" className="flex size-12 flex-none items-center justify-center rounded-xl text-base font-semibold text-[#161513]" style={{ background: ROLE_COLOR[node.role] }}>
            {node.name.replace(/^0x/, "").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] tracking-[0.08em] text-ink-muted uppercase">
              {ROLE_LABEL[node.role]}
              {node.band ? " · score " + node.band : ""}
            </p>
            <h2 id="party-title" className="mt-1 flex items-center gap-1.5 truncate text-2xl font-semibold tracking-[-0.03em]">
              <span className="truncate">{node.name}</span>
              {hasEns && <BadgeCheck aria-label="Has an ENS name" className="size-5 flex-none text-accent" />}
            </h2>
            <button type="button" onClick={() => copy(node.id, "Address")} className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted hover:text-ink">
              {shortHex(node.id)} <Copy aria-hidden="true" className="size-3" />
            </button>
          </div>
          <button ref={close} type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-ink-muted hover:bg-subtle hover:text-ink">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#f9cba9] p-3 text-[#161513]">
              <dt className="text-[11px] font-semibold tracking-[0.04em] uppercase opacity-65">Volume</dt>
              <dd className="mt-0.5 text-xl font-semibold">{formatHbar(node.volume)}</dd>
            </div>
            <div className="rounded-xl bg-[#dfe9d4] p-3 text-[#161513]">
              <dt className="text-[11px] font-semibold tracking-[0.04em] uppercase opacity-65">Invoices</dt>
              <dd className="mt-0.5 text-xl font-semibold">{node.invoices}</dd>
            </div>
          </dl>

          <h3 className="mt-6 text-sm font-semibold">
            Verify it <span className="pl-serif text-accent">yourself</span>
          </h3>
          <p className="mt-1 text-[13px] text-ink-muted">
            {hasEns
              ? "This name is an ENSv2 name on Sepolia. Its owner, expiry and records are public; nothing here needs our server."
              : "This party has no ENS name, so it shows as an address. You can still check it on the explorers."}
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {hasEns && (
              <>
                <VerifyLink href={ensApp(node.name)} title="Open in the ENS app" sub={"sepolia.app.ens.domains/" + node.name} />
                <button type="button" onClick={() => copy(node.name, "Name")} className="flex items-center justify-between rounded-xl border border-dashed border-line px-4 py-2.5 text-left text-[13px] text-ink-muted hover:text-ink">
                  Copy the name to look it up anywhere
                  <Copy aria-hidden="true" className="size-3.5" />
                </button>
              </>
            )}
            <VerifyLink href={etherscan(node.id)} title="Address on Sepolia Etherscan" sub={node.id} />
            {node.role === "buyer" && <VerifyLink href={hashscan(node.id)} title="Buyer vault on Hedera (HashScan)" sub={node.id} />}
          </div>

          <h3 className="mt-6 text-sm font-semibold">Connections ({links.length})</h3>
          <ul className="mt-2 divide-y divide-line text-[13px]">
            {links.map((l) => {
              const other = l.source === node.id ? l.target : l.source;
              const out = l.source === node.id;
              const verb = l.kind === "owes" ? (out ? "invoiced" : "owes") : l.kind === "funded" ? (out ? "funded" : "funded by") : out ? "vouches for" : "vouched for by";
              return (
                <li key={l.id} className="flex items-start gap-2.5 py-2.5">
                  <span aria-hidden="true" className="mt-1.5 size-2 flex-none rounded-full" style={{ background: HEALTH_COLOR[l.health] }} />
                  <span className="min-w-0">
                    <span className="text-ink-muted">{verb} </span>
                    <span className="font-medium">{nameOf(other)}</span>
                    <span className="block text-xs text-ink-muted">
                      {l.count} invoice{l.count === 1 ? "" : "s"} · {formatHbar(l.hbar)} · {HEALTH_LABEL[l.health]}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {node.role === "buyer" && (
          <div className="border-t border-line px-6 py-4">
            <Link href={"/agent/" + node.id} className="flex h-11 items-center justify-center rounded-[10px] bg-ink text-sm font-medium text-canvas hover:bg-ink-soft">
              Open the full agent profile
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
