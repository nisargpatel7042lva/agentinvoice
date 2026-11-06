"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { FGLink, FGNode, FGRef } from "./ForceGraphClient";
import type { GraphLink, GraphNode, Health, LinkKind } from "@/lib/graph";
import { cn } from "@/lib/cn";
import { formatHbar } from "@/lib/format";

// Canvas + physics only exist in the browser.
const ForceGraph2D = dynamic(() => import("./ForceGraphClient"), { ssr: false });

type N = FGNode;
type L = FGLink;

const ROLE_LABEL = { buyer: "Buyer agent", supplier: "Supplier", investor: "Investor", sponsor: "Sponsor" } as const;
const KIND_LABEL: Record<LinkKind, string> = { owes: "Owes (invoices)", funded: "Funded", sponsors: "Vouches for" };
const HEALTH_LABEL: Record<Health, string> = { good: "Paid on time", late: "Has late payments", default: "Has a default", open: "Not settled yet" };

// Colours come from the graph's own container, so a section can force a theme with data-theme="dark".
function readTheme(el: Element = document.documentElement) {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    ink: v("--color-ink"),
    muted: v("--color-ink-muted"),
    line: v("--color-line"),
    surface: v("--color-surface"),
    canvas: v("--color-canvas"),
    role: { buyer: v("--color-accent"), supplier: v("--color-status-open"), investor: v("--color-band-a"), sponsor: v("--color-ink-soft") },
    health: { good: v("--color-accent"), late: v("--color-warn"), default: v("--color-danger"), open: v("--color-ink-faint") },
    band: { A: v("--color-band-a"), B: v("--color-band-b"), C: v("--color-band-c"), New: v("--color-band-new") },
  };
}

const idOf = (end: string | number | N | undefined) => (typeof end === "object" ? String(end?.id) : String(end));

interface Props {
  nodes: GraphNode[];
  links: GraphLink[];
  height?: number;
  /** Mini version for an agent profile: no filters or side panel, click a node to open its page. */
  compact?: boolean;
  focusId?: string;
}

export function NetworkGraph({ nodes, links, height = 560, compact = false, focusId }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg: FGRef = useRef(undefined);
  const [width, setWidth] = useState(800);
  const [theme, setTheme] = useState<ReturnType<typeof readTheme> | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [kinds, setKinds] = useState<Record<LinkKind, boolean>>({ owes: true, funded: true, sponsors: true });

  // Size to the container, and re-read colours when the day/night theme flips.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    setTheme(readTheme(el));
    const mo = new MutationObserver(() => setTheme(readTheme(el)));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  // Fresh objects for the physics engine (it mutates them with x/y).
  const data = useMemo(() => {
    const ls = links.filter((l) => kinds[l.kind]);
    return { nodes: nodes.map((n) => ({ ...n })) as N[], links: ls.map((l) => ({ ...l })) as L[] };
  }, [nodes, links, kinds]);

  const maxVol = useMemo(() => Math.max(1, ...nodes.map((n) => n.volume)), [nodes]);
  const maxHbar = useMemo(() => Math.max(1, ...links.map((l) => l.hbar)), [links]);
  const radius = (n: GraphNode) => 4 + 12 * Math.sqrt(n.volume / maxVol);
  const width_ = (l: GraphLink) => 0.8 + 5 * Math.sqrt(l.hbar / maxHbar);

  const focus = hover ?? (compact ? null : selected);
  const neighbours = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    for (const l of data.links) {
      const a = idOf(l.source), b = idOf(l.target);
      if (a === focus) s.add(b);
      if (b === focus) s.add(a);
    }
    return s;
  }, [focus, data.links]);

  const sel = selected ? nodes.find((n) => n.id === selected) : undefined;
  const selLinks = sel ? links.filter((l) => l.source === sel.id || l.target === sel.id).sort((a, b) => b.hbar - a.hbar) : [];
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;

  const summary = `${nodes.length} parties and ${links.length} connections. ${links.filter((l) => l.health === "default").length} with a default, ${links.filter((l) => l.health === "late").length} with late payments.`;

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Show connections</legend>
            {(Object.keys(KIND_LABEL) as LinkKind[]).map((k) => (
              <label key={k} className={cn("flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-[13px]", kinds[k] ? "border-ink-faint bg-surface text-ink" : "border-line text-ink-muted")}>
                <input type="checkbox" className="accent-[var(--color-accent)]" checked={kinds[k]} onChange={() => setKinds((s) => ({ ...s, [k]: !s[k] }))} />
                {KIND_LABEL[k]}
              </label>
            ))}
          </fieldset>
          <Legend />
        </div>
      )}

      <div className="relative overflow-hidden rounded-xl border border-line bg-surface">
        <div ref={wrap} role="img" aria-label={`Network graph. ${summary}`} className="w-full" style={{ height }}>
          {theme && (
            <ForceGraph2D
              fgRef={fg}
              charge={compact ? -160 : -260}
              linkDistance={compact ? 55 : 80}
              fitPadding={compact ? 24 : 48}
              warmupTicks={80}
              width={width}
              height={height}
              graphData={data}
              backgroundColor="rgba(0,0,0,0)"
              cooldownTicks={120}
              nodeId="id"
              nodeVal={(n) => radius(n)}
              nodeLabel={(n) => `${n.name} · ${ROLE_LABEL[n.role]} · ${formatHbar(n.volume)}`}
              onNodeHover={(n) => setHover(n ? String(n.id) : null)}
              onNodeClick={(n) => {
                if (compact) {
                  if (n.role === "buyer") window.location.href = `/agent/${n.id}`;
                  return;
                }
                setSelected(String(n.id));
              }}
              onBackgroundClick={() => setSelected(null)}
              linkWidth={(l) => width_(l)}
              linkColor={(l) => {
                const dim = neighbours && !(neighbours.has(idOf(l.source)) && neighbours.has(idOf(l.target)));
                const c = theme.health[l.health];
                return dim ? `color-mix(in srgb, ${c} 15%, transparent)` : c;
              }}
              linkLineDash={(l) => (l.kind === "sponsors" ? [4, 3] : null)}
              linkDirectionalParticles={(l) => (l.kind === "owes" && l.health === "open" ? 2 : 0)}
              linkDirectionalParticleWidth={2}
              linkDirectionalParticleColor={() => theme.health.open}
              nodeCanvasObject={(n, ctx, scale) => {
                const r = radius(n);
                const dim = neighbours && !neighbours.has(String(n.id));
                const isFocus = focusId?.toLowerCase() === n.id || selected === n.id;
                ctx.globalAlpha = dim ? 0.18 : 1;
                ctx.beginPath();
                ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
                ctx.fillStyle = theme.role[n.role];
                ctx.fill();
                if (n.role === "buyer" && n.band) {
                  ctx.lineWidth = 3 / scale + 1.5;
                  ctx.strokeStyle = theme.band[n.band];
                  ctx.beginPath();
                  ctx.arc(n.x ?? 0, n.y ?? 0, r + 2.5, 0, 2 * Math.PI);
                  ctx.stroke();
                }
                if (isFocus) {
                  ctx.lineWidth = 2 / scale;
                  ctx.strokeStyle = theme.ink;
                  ctx.beginPath();
                  ctx.arc(n.x ?? 0, n.y ?? 0, r + 6, 0, 2 * Math.PI);
                  ctx.stroke();
                }
                // Labels like Obsidian: big parties always, the rest when zoomed in or highlighted.
                if (scale > 1.4 || r > 9 || (neighbours && !dim) || isFocus) {
                  const fs = Math.max(10 / scale, 3);
                  ctx.font = `${n.role === "buyer" ? 600 : 400} ${fs}px Inter, sans-serif`;
                  ctx.textAlign = "center";
                  ctx.textBaseline = "top";
                  ctx.fillStyle = theme.ink;
                  ctx.fillText(n.name, n.x ?? 0, (n.y ?? 0) + r + 4);
                }
                ctx.globalAlpha = 1;
              }}
              nodePointerAreaPaint={(n, color, ctx) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(n.x ?? 0, n.y ?? 0, radius(n) + 4, 0, 2 * Math.PI);
                ctx.fill();
              }}
            />
          )}
        </div>

        {!compact && sel && (
          <aside aria-label={`Details for ${sel.name}`} className="absolute top-3 right-3 bottom-3 flex w-72 max-w-[calc(100%-1.5rem)] flex-col rounded-xl border border-line bg-surface p-4 shadow-raised">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{sel.name}</div>
                <div className="text-xs text-ink-muted">{ROLE_LABEL[sel.role]}{sel.band ? ` · score ${sel.band}` : ""}</div>
              </div>
              <button type="button" aria-label="Close details" onClick={() => setSelected(null)} className="rounded-md p-1 text-ink-muted hover:bg-subtle">
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-subtle p-2"><dt className="text-xs text-ink-muted">Volume</dt><dd className="m-0 font-semibold">{formatHbar(sel.volume)}</dd></div>
              <div className="rounded-lg bg-subtle p-2"><dt className="text-xs text-ink-muted">Invoices</dt><dd className="m-0 font-semibold">{sel.invoices}</dd></div>
            </dl>
            <h3 className="mt-4 text-xs font-medium text-ink-muted">Connections ({selLinks.length})</h3>
            <ul className="mt-2 flex-1 space-y-2 overflow-y-auto text-[13px]">
              {selLinks.map((l) => {
                const other = l.source === sel.id ? l.target : l.source;
                const out = l.source === sel.id;
                const verb = l.kind === "owes" ? (out ? "invoiced" : "owes") : l.kind === "funded" ? (out ? "funded" : "funded by") : out ? "vouches for" : "vouched for by";
                return (
                  <li key={l.id} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-1.5 size-2 flex-none rounded-full" style={{ background: theme?.health[l.health] }} />
                    <span className="min-w-0">
                      <span className="text-ink-muted">{verb} </span>
                      <span className="font-medium">{nameOf(other)}</span>
                      <span className="block text-xs text-ink-muted">{l.count} invoice{l.count === 1 ? "" : "s"} · {formatHbar(l.hbar)} · {HEALTH_LABEL[l.health]}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {sel.role === "buyer" && (
              <Link href={`/agent/${sel.id}`} className="mt-3 rounded-lg bg-accent px-3 py-2 text-center text-sm font-medium text-on-accent hover:bg-accent-hover">
                Open agent profile
              </Link>
            )}
          </aside>
        )}
      </div>
      {!compact && <p className="text-xs text-ink-muted">Drag to move, scroll to zoom, hover to highlight, click a party for details.</p>}
    </div>
  );
}

function Legend() {
  const dot = (cls: string, label: string) => (
    <span className="flex items-center gap-1.5"><span aria-hidden="true" className={cn("size-2.5 rounded-full", cls)} />{label}</span>
  );
  const bar = (cls: string, label: string, dashed = false) => (
    <span className="flex items-center gap-1.5"><span aria-hidden="true" className={cn("h-0 w-4 border-t-2", cls, dashed && "border-dashed")} />{label}</span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
      {dot("bg-accent", "Buyer agent")}
      {dot("bg-status-open", "Supplier")}
      {dot("bg-band-a", "Investor")}
      {dot("bg-ink-soft", "Sponsor")}
      {bar("border-accent", "Paid on time")}
      {bar("border-warn", "Late")}
      {bar("border-danger", "Default")}
      {bar("border-ink-soft", "Vouches for", true)}
    </div>
  );
}
