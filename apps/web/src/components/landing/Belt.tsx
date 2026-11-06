"use client";

import { useEffect, useRef } from "react";

// Sample invoices for the illustration only (fictional businesses). Real ones live on /market.
const ITEMS = [
  { id: "0413", from: "Harbor Logistics", to: "buyer-agent.eth", face: 10, price: 9.5, due: "9 Nov", seq: 1182, tx: "0.0.5005@1793952000.118" },
  { id: "0414", from: "Atlas Print Co.", to: "ops-agent.eth", face: 24, price: 22.6, due: "12 Nov", seq: 1187, tx: "0.0.5005@1794211200.402" },
  { id: "0415", from: "Kiln & Co. Ceramics", to: "buyer-agent.eth", face: 6.5, price: 6.2, due: "14 Nov", seq: 1191, tx: "0.0.5005@1794384000.077" },
  { id: "0416", from: "Lumen Data Labs", to: "globex-agent.eth", face: 40, price: 37.4, due: "18 Nov", seq: 1203, tx: "0.0.5005@1794729600.913" },
  { id: "0417", from: "Fieldstone Farms", to: "ops-agent.eth", face: 15, price: 14.1, due: "21 Nov", seq: 1209, tx: "0.0.5005@1794988800.260" },
  { id: "0418", from: "Copperline Studio", to: "buyer-agent.eth", face: 8, price: 7.6, due: "25 Nov", seq: 1214, tx: "0.0.5005@1795334400.531" },
];
const PALETTE = ["#e8521e", "#f26b3a", "#f47d45", "#f79a5e", "#fab585", "#fcd6b8", "#fff1e4"];
const hbar = (n: number) => n.toFixed(2);

function hash(a: number, b: number, c: number) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The settlement belt: invoices drift left, and each one turns into its on-chain receipt as it crosses the line. */
export function Belt() {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const receipts = useRef<(HTMLDivElement | null)[]>([]);
  const amount = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = root.current!;
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, cw = 0, ch = 0, gap = 0, Lx = 0, top = 0, dpr = 1;
    const measure = () => {
      const r = el.getBoundingClientRect();
      W = r.width;
      H = r.height;
      const c = cards.current[0]!.getBoundingClientRect();
      cw = c.width;
      ch = c.height;
      top = c.top - r.top;
      gap = Math.max(28, W * 0.035);
      Lx = W / 2;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = W * dpr;
      cv.height = H * dpr;
    };
    measure();
    window.addEventListener("resize", measure);

    let off = W / 2 - 0.6 * cw;
    const auto = reduce ? 0 : -Math.max(50, W * 0.055);
    let vel = auto, hover = 0, hoverTarget = 0, dragging = false, lastX = 0, lastT = 0;
    let shown = 0, crossing = -1, last = performance.now(), raf = 0, t = 0;
    const sparks: { x: number; y: number; vx: number; vy: number; s: number; c: string; life: number }[] = [];

    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastT = performance.now();
      el.setPointerCapture(e.pointerId);
      el.dataset.drag = "1";
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - lastX;
      off += dx;
      vel = (dx / Math.max(8, now - lastT)) * 1000 * 0.8 + vel * 0.2;
      lastX = e.clientX;
      lastT = now;
    };
    const up = () => {
      dragging = false;
      delete el.dataset.drag;
    };
    const enter = () => (hoverTarget = 1);
    const leave = () => (hoverTarget = 0);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      hover += (hoverTarget - hover) * Math.min(1, dt * 4);
      if (!dragging) {
        vel += (auto * (1 - 0.65 * hover) - vel) * (1 - Math.exp(-2.2 * dt));
        off += vel * dt;
      }
      const span = cw + gap;
      const period = span * ITEMS.length;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      let now_crossing = -1, progress = 0;

      ITEMS.forEach((_, i) => {
        const x = ((((off + i * span + span) % period) + period) % period) - span;
        const cut = Math.max(0, Math.min(cw, Lx - x));
        const card = cards.current[i]!;
        const rec = receipts.current[i]!;
        card.style.transform = rec.style.transform = `translate3d(${x}px,0,0)`;
        card.style.clipPath = cut > 0 ? `inset(0 0 0 ${cut}px)` : "";
        card.style.visibility = cut >= cw ? "hidden" : "";
        rec.style.clipPath = `inset(0 ${cw - cut}px 0 0)`;
        rec.style.visibility = cut > 0 ? "" : "hidden";
        if (cut > 0 && cut < cw) {
          now_crossing = i;
          progress = cut / cw;
        }
        if (cut <= 0 || x + cw <= Lx) return;

        // Haze on the card side of the line.
        const hz = Math.min(130, x + cw - Lx);
        const g = ctx.createLinearGradient(Lx, 0, Lx + hz, 0);
        g.addColorStop(0, "rgba(242,107,58,.35)");
        g.addColorStop(1, "rgba(242,107,58,0)");
        ctx.fillStyle = g;
        ctx.fillRect(Lx, top, hz, ch);

        // Dithered dots fixed to the card surface, dense at the line and thinning out.
        const R = 0.28 * cw;
        const rows = Math.ceil(ch / 3);
        const tick = reduce ? 0 : Math.floor(t * 9);
        for (let gx = Math.floor(cut / 3); gx * 3 < cw; gx++) {
          const sx = x + gx * 3;
          const d = sx - Lx;
          if (d > R) break;
          if (d < 0) continue;
          const p = Math.pow(1 - d / R, 1.7);
          for (let row = -4; row < rows + 4; row++) {
            const inside = row >= 0 && row < rows;
            const edge = inside ? 1 : 1 - Math.min(4, row < 0 ? -row : row - rows + 1) / 4;
            if (hash(gx, row, i) >= p * (inside ? 0.9 : 0.16 * edge)) continue;
            if (!reduce && hash(gx, row, tick + 97) < 0.22) continue;
            const h2 = hash(row, gx, i + 31);
            ctx.fillStyle = d < 10 ? PALETTE[4 + Math.floor(h2 * 3)] : PALETTE[Math.floor(h2 * h2 * 7)];
            const s = 1.1 + h2 * 1.6;
            ctx.fillRect(sx + (hash(gx, row, 7) - 0.5) * 1.6, top + row * 3 + (hash(row, gx, 9) - 0.5) * 1.6, s, s);
          }
        }
        if (!reduce) {
          for (let k = 0; k < 3; k++) {
            if (Math.random() < 0.7) {
              sparks.push({ x: Lx + Math.random() * 30, y: top - 10 + Math.random() * (ch + 20), vx: -30 + Math.random() * 70 + vel * 0.6, vy: (Math.random() - 0.5) * 50, s: 0.8 + Math.random() * 1.8, c: PALETTE[Math.floor(Math.random() * 7)], life: 0.3 + Math.random() * 0.8 });
            }
          }
        }
      });

      for (let k = sparks.length - 1; k >= 0; k--) {
        const sp = sparks[k];
        sp.life -= dt;
        if (sp.life <= 0) {
          sparks.splice(k, 1);
          continue;
        }
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        ctx.globalAlpha = Math.min(1, sp.life * 2.2);
        ctx.fillStyle = sp.c;
        ctx.fillRect(sp.x, sp.y, sp.s, sp.s);
      }
      ctx.globalAlpha = 1;

      // Counter: HBAR repaid by the invoice crossing the line right now.
      if (now_crossing !== -1) {
        const it = ITEMS[now_crossing];
        if (now_crossing !== crossing) {
          crossing = now_crossing;
          shown = it.face * progress;
          label.current!.textContent = `#${it.id} on time`;
        }
        shown += (it.face * progress - shown) * Math.min(1, dt * 14);
        amount.current!.textContent = `+${hbar(shown)} HBAR`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div ref={root} className="lp-belt" role="img" aria-label="Animation: invoices move across a line and turn into paid receipts on Hedera.">
      <div className="lp-receipts" aria-hidden="true">
        {ITEMS.map((it, i) => (
          <div key={it.id} ref={(n) => { receipts.current[i] = n; }} className="lp-receipt">
            <pre>{`<receipt network="hedera-testnet">
  invoice    #${it.id}
  repaid     ${hbar(it.face)} HBAR
  by         ${it.to}
  investor   paid ${hbar(it.price)} on day 0
  return     +${hbar(it.face - it.price)} HBAR
  status     Paid · on time
</receipt>`}</pre>
            <pre className="lp-receipt-meta">{`<!-- hcs seq #${it.seq} -->
<!-- tx ${it.tx} -->
<!-- hashscan.io/testnet -->`}</pre>
          </div>
        ))}
      </div>
      <div className="lp-invoices" aria-hidden="true">
        {ITEMS.map((it, i) => (
          <div key={it.id} ref={(n) => { cards.current[i] = n; }} className={`lp-inv lp-inv-${i % 3}`}>
            <div className="lp-inv-head">
              <span>INVOICE #{it.id}</span>
              <span className="lp-inv-status">Funded</span>
            </div>
            <div className="lp-inv-amt">{hbar(it.face)} <small>HBAR</small></div>
            <dl className="lp-inv-meta">
              <div><dt>From</dt><dd>{it.from}</dd></div>
              <div><dt>Bill to</dt><dd>{it.to}</dd></div>
              <div><dt>Due</dt><dd>{it.due}</dd></div>
            </dl>
          </div>
        ))}
      </div>
      <canvas ref={canvas} className="lp-fx" aria-hidden="true" />
      <div className="lp-scan" aria-hidden="true">
        <i />
        <b />
      </div>
      <div className="lp-badge" aria-hidden="true">
        <span className="lp-badge-label">Settled on Hedera</span>
        <span className="lp-badge-pill">
          <span ref={amount}>+0.00 HBAR</span>
          <span ref={label}>on time</span>
        </span>
      </div>
    </div>
  );
}
