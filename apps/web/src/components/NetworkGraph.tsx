"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { HEALTH_COLOR, PartyDialog, ROLE_COLOR, ROLE_LABEL } from "./PartyDialog";
import type { FGLink, FGNode, FGRef } from "./ForceGraphClient";
import type { GraphLink, GraphNode, LinkKind } from "@/lib/graph";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

// Canvas + physics only exist in the browser.
const ForceGraph2D = dynamic(() => import("./ForceGraphClient"), { ssr: false });

type N = FGNode;
type L = FGLink;

const KIND_LABEL: Record<LinkKind, string> = { owes: "Owes (invoices)", funded: "Funded", sponsors: "Vouches for" };

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
    role: ROLE_COLOR,
    health: HEALTH_COLOR,
    band: { A: "#7cc488", B: "#ecc94b", C: "#f79a5e", New: "#8a867d" },
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

  const focus = hover ?? selected;
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
              nodeLabel={(n) => `${n.name} · ${ROLE_LABEL[n.role]} · ${formatMoney(n.volume)}`}
              onNodeHover={(n) => setHover(n ? String(n.id) : null)}
              onNodeClick={(n) => setSelected(String(n.id))}
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
                  const ly = (n.y ?? 0) + r + (isFocus ? 10 : 5);
                  ctx.lineJoin = "round";
                  ctx.lineWidth = Math.max(3 / scale, 1);
                  ctx.strokeStyle = theme.canvas;
                  ctx.strokeText(n.name, n.x ?? 0, ly);
                  ctx.fillStyle = theme.ink;
                  ctx.fillText(n.name, n.x ?? 0, ly);
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

        {sel && <PartyDialog node={sel} links={selLinks} nameOf={nameOf} onClose={() => setSelected(null)} />}
      </div>
      {!compact && <p className="text-xs text-ink-muted">Drag to move, scroll to zoom, hover to highlight, click a party to verify it on ENS.</p>}
    </div>
  );
}

function Legend() {
  const dot = (color: string, label: string) => (
    <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: color }} />{label}</span>
  );
  const bar = (color: string, label: string, dashed = false) => (
    <span className="flex items-center gap-1.5"><span aria-hidden="true" className={cn("h-0 w-4 border-t-2", dashed && "border-dashed")} style={{ borderColor: color }} />{label}</span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
      {dot(ROLE_COLOR.buyer, "Buyer agent")}
      {dot(ROLE_COLOR.supplier, "Supplier")}
      {dot(ROLE_COLOR.investor, "Investor")}
      {dot(ROLE_COLOR.sponsor, "Sponsor")}
      {bar(HEALTH_COLOR.good, "Paid on time")}
      {bar(HEALTH_COLOR.late, "Late")}
      {bar(HEALTH_COLOR.default, "Default")}
      {bar(HEALTH_COLOR.open, "Vouches for", true)}
    </div>
  );
}
