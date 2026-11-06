"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Bot, Fingerprint, Gauge, Globe2, Landmark, Layers, ScrollText, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buttonVariants } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ProductPanel } from "./ProductPanel";
import { RevealText, type Line } from "./RevealText";
import { clamp01, hexToRgb, paint, smooth, type RGB } from "./reveal";

// ---------------- copy ----------------
const HERO: Line[] = [["Get paid ", { hl: "today" }, " for invoices"], ["due next month"]];
const STATEMENT: Line[] = [
  ["AgentInvoice turns unpaid invoices into cash."],
  ["Suppliers get paid today, investors earn a fixed return,"],
  ["AI buyer agents repay on time within on-chain limits,"],
  ["and a verified human answers for every agent"],
];
const SPLIT: Line[] = [["Agents that pay"], ["the way you would"]];
const TILES = [
  { icon: Globe2, label: "Settles on Hedera" },
  { icon: Landmark, label: "Names on ENS" },
  { icon: Fingerprint, label: "World ID sponsors" },
  { icon: ScrollText, label: "x402 payments" },
  { icon: Layers, label: "HCS audit trail" },
  { icon: ShieldCheck, label: "On-chain limits" },
  { icon: Gauge, label: "Credit scores" },
  { icon: Bot, label: "Agent Accounts ready" },
];

// ---------------- bowl glow (Halden spec) ----------------
const KEYS = {
  q: [0, 0.03, 0.08, 0.18, 0.4, 0.66, 0.87, 1.15, 1.43, 1.8],
  tip: [0.3, 0.45, 0.65, 0.8, 0.95, 1.05, 1.05, 1.1, 1.3, 2.4],
  half: [0.34, 0.38, 0.38, 0.38, 0.38, 0.46, 0.66, 0.9, 1.6, 3.0],
  soft: [0.22, 0.26, 0.22, 0.22, 0.19, 0.16, 0.13, 0.1, 0.1, 0.1],
};
function lerpKey(arr: number[], q: number) {
  const ks = KEYS.q;
  if (q <= ks[0]) return arr[0];
  for (let i = 1; i < ks.length; i++) {
    if (q <= ks[i]) {
      const t = (q - ks[i - 1]) / (ks[i] - ks[i - 1]);
      return arr[i - 1] + (arr[i] - arr[i - 1]) * t;
    }
  }
  return arr[arr.length - 1];
}

const W = 96;
const H = 60;
const RND = 0.25;

function drawBowl(ctx: CanvasRenderingContext2D, img: ImageData, tip: number, half: number, soft: number, aspect: number, cols: { out: RGB; rim: RGB; core: RGB }) {
  const data = img.data;
  const visible = tip > 0.02;
  // Edge polyline: 48 points from yy = -0.3 to tip.
  const N = 48;
  const ex = new Float32Array(N);
  const ey = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const yy = -0.3 + ((tip + 0.3) * k) / (N - 1);
    ex[k] = half * aspect * Math.pow(Math.max(0, 1 - yy / tip), 0.72);
    ey[k] = yy;
  }
  for (let j = 0; j < H; j++) {
    const py = (j + 0.5) / H;
    for (let i = 0; i < W; i++) {
      const px = Math.abs((i + 0.5) / W - 0.5) * aspect;
      let g = 0;
      if (visible) {
        let d2 = Infinity;
        for (let k = 0; k < N - 1; k++) {
          const ax = ex[k], ay = ey[k], bx = ex[k + 1], by = ey[k + 1];
          const vx = bx - ax, vy = by - ay;
          const len = vx * vx + vy * vy || 1e-9;
          let t = ((px - ax) * vx + (py - ay) * vy) / len;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
          const dd = dx * dx + dy * dy;
          if (dd < d2) d2 = dd;
        }
        let sd = Math.sqrt(d2);
        const inside = py < tip && px < half * aspect * Math.pow(Math.max(0, 1 - py / tip), 0.72);
        if (inside) sd = -sd;
        sd -= RND;
        g = 1 - smooth((sd + soft) / (2 * soft));
      }
      let r: number, gg: number, b: number;
      if (g < 0.38) {
        const t = smooth(g / 0.38);
        r = cols.out[0] + (cols.rim[0] - cols.out[0]) * t;
        gg = cols.out[1] + (cols.rim[1] - cols.out[1]) * t;
        b = cols.out[2] + (cols.rim[2] - cols.out[2]) * t;
      } else {
        const t = smooth((g - 0.38) / 0.62);
        r = cols.rim[0] + (cols.core[0] - cols.rim[0]) * t;
        gg = cols.rim[1] + (cols.core[1] - cols.rim[1]) * t;
        b = cols.rim[2] + (cols.core[2] - cols.rim[2]) * t;
      }
      const o = (j * W + i) * 4;
      data[o] = r;
      data[o + 1] = gg;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function cssColor(name: string, fallback: string): RGB {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return hexToRgb(/^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback);
}

export function Landing() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const nav = useRef<HTMLElement>(null);
  const h1 = useRef<HTMLElement>(null);
  const stmt = useRef<HTMLElement>(null);
  const split = useRef<HTMLElement>(null);
  const h2 = useRef<HTMLElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const zoom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(W, H);

    let colors = { out: cssColor("--color-canvas", "#ffffff"), rim: cssColor("--color-accent-200", "#d2daff"), core: cssColor("--color-glow", "#8fd5f1") };
    let text = {
      ink: cssColor("--color-ink", "#0b1d3a"),
      highlight: cssColor("--color-highlight", "#5b7cf0"),
      ghost: cssColor("--color-canvas", "#ffffff"),
    };
    const isDark = () => document.documentElement.dataset.theme === "dark";
    const readTheme = () => {
      colors = { out: cssColor("--color-canvas", "#ffffff"), rim: cssColor("--color-accent-200", "#d2daff"), core: cssColor("--color-glow", "#8fd5f1") };
      text = { ink: cssColor("--color-ink", "#0b1d3a"), highlight: cssColor("--color-highlight", "#5b7cf0"), ghost: cssColor("--color-canvas", "#ffffff") };
    };
    const themeObs = new MutationObserver(() => {
      readTheme();
      onScroll();
      if (reduce) heroP = 1;
      paintHero();
    });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const accent = () => (isDark() ? hexToRgb("#8fe6f4") : hexToRgb("#3f7cff"));
    const lightCols = () => ({ ghost: text.ghost, accent: accent(), final: text.ink, highlight: text.highlight });
    const darkCols = { ghost: hexToRgb("#5c6f92"), accent: hexToRgb("#8fe6f4"), final: hexToRgb("#ffffff"), highlight: hexToRgb("#9db4ff") };

    // ---- state ----
    const cur = { tip: -0.3, half: 0.3, soft: 0.1 };
    const tgt = { tip: 0.3, half: 0.34, soft: 0.22 };
    const start = performance.now();
    let introDone = reduce;
    let heroP = reduce ? 1 : 0;
    let raf = 0;

    const paintHero = () => paint(h1.current, heroP, 0.35, lightCols());

    function onScroll() {
      const vh = window.innerHeight;
      const q = window.scrollY / vh;
      tgt.tip = lerpKey(KEYS.tip, q);
      tgt.half = lerpKey(KEYS.half, q);
      tgt.soft = lerpKey(KEYS.soft, q);

      // statement: rise + reveal + nav CTA
      const s = clamp01((q - 0.69) / 0.74);
      if (stmt.current) stmt.current.style.transform = reduce ? "none" : `translateY(${(0.205 * (1 - s) * (1 - s) * vh).toFixed(1)}px)`;
      const p = reduce ? 1 : clamp01((q - 0.56) / 2.03);
      paint(stmt.current, p, 0.16, lightCols());
      nav.current?.classList.toggle("on", p > 0.4);

      // dark split
      const top = split.current?.getBoundingClientRect().top ?? vh;
      const p2 = reduce ? 1 : clamp01((0.8 - top / vh) / 0.65);
      paint(h2.current, p2, 0.35, darkCols);
      row.current?.classList.toggle("show", p2 > 0.92);
      if (zoom.current) zoom.current.style.transform = reduce ? "none" : `scale(${(1.08 - 0.08 * clamp01(1 - top / vh)).toFixed(4)})`;
    }

    function frame(now: number) {
      const t = now - start;
      if (!introDone) {
        // Intro: nothing visible, then after 0.25 s the glow drops in from the top and blooms (1.05 s, smoothstep).
        const k = smooth((t - 250) / 1050);
        cur.tip = -0.3 + (tgt.tip + 0.3) * k;
        cur.half = 0.3 + (tgt.half - 0.3) * k;
        cur.soft = 0.1 + (tgt.soft - 0.1) * k;
        if (t > 1300) introDone = true;
        heroP = clamp01(t / 1250);
        paintHero();
      } else {
        cur.tip += (tgt.tip - cur.tip) * 0.12;
        cur.half += (tgt.half - cur.half) * 0.12;
        cur.soft += (tgt.soft - cur.soft) * 0.12;
      }
      const drift = reduce ? 0 : 1;
      const tip = cur.tip + Math.sin(t * 0.00033 + 1.3) * 0.02 * drift;
      const half = cur.half + Math.sin(t * 0.0005) * 0.015 * drift;
      drawBowl(ctx!, img, tip, half, cur.soft, window.innerWidth / window.innerHeight, colors);
      raf = requestAnimationFrame(frame);
    }

    onScroll();
    paintHero();
    if (reduce) {
      Object.assign(cur, tgt);
    }
    document.body.classList.add("ready");
    raf = requestAnimationFrame(frame);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      themeObs.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="landing">
      <div className="atmo">
        <canvas ref={canvas} width={W} height={H} />
      </div>

      <header ref={nav} className="lnav">
        <Link href="/" className="brand" aria-label="AgentInvoice home">
          <BrandMark />
          AgentInvoice
        </Link>
        <nav aria-label="Main" className="links">
          <Link href="/market">Marketplace</Link>
          <Link href="/network">Network</Link>
          <a href="#how">How it works</a>
        </nav>
        <div className="right">
          <ThemeToggle />
          <Link href="/supplier" className="login">Create invoice</Link>
          <div className="navcta">
            <Link href="/market" className={buttonVariants()} tabIndex={0}>
              <span className="lbl">Open app</span>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="hero" aria-label="Introduction">
          <RevealText as="h1" lines={HERO} innerRef={h1} />
          <p className="trust fade-up" style={{ ["--d" as string]: "1.15s" }}>
            Suppliers get paid now, investors earn a fixed return, and every buyer agent has a verified human behind it.
          </p>
          <div className="cta fade-up" style={{ ["--d" as string]: "1.3s" }}>
            <Link href="/market" className={buttonVariants({ size: "xl" })}>
              Open the marketplace
            </Link>
          </div>
          <ul className="tiles" aria-label="What it is built on">
            {TILES.map((t, i) => (
              <li key={t.label} className="tile fade-up" style={{ ["--d" as string]: `${[1.25, 1.32, 1.39, 1.46, 1.42, 1.49, 1.56, 1.63][i]}s` }}>
                <t.icon aria-hidden="true" strokeWidth={1.8} />
                <span>{t.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="statement" aria-label="What AgentInvoice does">
          <div className="pin">
            <RevealText lines={STATEMENT} innerRef={stmt} />
          </div>
        </section>

        <section ref={split} className="split" id="how" aria-label="How it works">
          <div className="l">
            <RevealText as="h2" lines={SPLIT} innerRef={h2} />
            <div ref={row} className="row">
              <h3>For investors</h3>
              <p>
                <b>Fund in seconds. See the risk. Get repaid on time.</b> Every buyer agent has a credit score, a public ENS name and a sponsor verified
                with World ID, and every payment settles on Hedera with a receipt you can check.
              </p>
              <h3>For suppliers</h3>
              <p>
                <b>Stop waiting 30 days.</b> Create an invoice, let an investor fund it, and receive the money today. The buyer&apos;s agent repays the investor on
                the due date.
              </p>
            </div>
          </div>
          <div className="r">
            {/* Image slot: a generated photo can replace this panel later (docs/design/tokens.md). */}
            <div ref={zoom} className="zoom">
              <ProductPanel />
            </div>
          </div>
        </section>

        <section className="closing" aria-label="Get started">
          <div className="band">
            <div>
              <span className="pill">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-[#2fe0d0] shadow-[0_0_8px_#2fe0d0]" />
                Live on Hedera testnet
              </span>
              <h2>
                Your next invoice
                <br />
                <span className="muted">gets paid today.</span>
              </h2>
              <p className="lead">
                Create an invoice, let an investor fund it, and let the buyer&apos;s agent repay it on time. Testnet prototype: no real money, not
                financial advice.
              </p>
              <Link href="/market" className={cn("glass btn-dot")}>
                Open the marketplace
              </Link>
            </div>
            <ProductPanel tilt="left" />
          </div>

          <footer>
            <div className="foot">
              <div>
                <div className="flex items-center gap-2.5 text-[17px] font-medium">
                  <BrandMark />
                  AgentInvoice
                </div>
                <p className="blurb">Invoice financing for the agent economy: dollars in, dollars out, a verified human behind every agent.</p>
              </div>
              <nav aria-label="Product">
                <h4>Product</h4>
                <ul>
                  <li><Link href="/market">Marketplace</Link></li>
                  <li><Link href="/network">Network</Link></li>
                  <li><Link href="/supplier">Create invoice</Link></li>
                </ul>
              </nav>
              <div>
                <h4>Built on</h4>
                <ul>
                  <li>Hedera</li>
                  <li>ENS</li>
                  <li>World ID</li>
                  <li>x402</li>
                </ul>
              </div>
              <div>
                <h4>Learn</h4>
                <ul>
                  <li><a href="#how">How it works</a></li>
                  <li><Link href="/market">See live invoices</Link></li>
                </ul>
              </div>
            </div>
            <div className="legal">
              <span>© 2026 AgentInvoice</span>
              <span>Testnet prototype. Not financial advice.</span>
            </div>
            <div className="wordmark" aria-hidden="true">AgentInvoice</div>
          </footer>
        </section>
      </main>
    </div>
  );
}
