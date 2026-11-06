"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, ShieldCheck } from "lucide-react";
import { formatUnits, type CreditFactor, type CreditReport } from "@invoiceagent/shared";
import { copy } from "@/lib/copy";
import { Section } from "./Section";

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy - r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${r} ${r} 0 0 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

// Landing hues: coral for weak, lemon for fair, sage for strong.
const GAUGE = { C: "#f79a5e", B: "#ecc94b", A: "#7cc488" };

export function CreditScoreCard({ report, className = "" }: { report: CreditReport; className?: string }) {
  const [expandedFactors, setExpandedFactors] = useState<Record<string, boolean>>({});

  const toggleEvidence = (key: string) => {
    setExpandedFactors((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const cx = 120;
  const cy = 110;
  const r = 85;

  // Arc boundaries:
  // C: 300..650 (span 350 / 600 -> 105 deg) => 180 to 75
  // B: 650..750 (span 100 / 600 -> 30 deg)  => 75 to 45
  // A: 750..900 (span 150 / 600 -> 45 deg)  => 45 to 0
  const arcC = describeArc(cx, cy, r, 180, 76);
  const arcB = describeArc(cx, cy, r, 74, 46);
  const arcA = describeArc(cx, cy, r, 44, 0);

  // Needle position:
  const isNew = report.score === null;
  const clampedScore = report.score === null ? 300 : Math.max(300, Math.min(900, report.score));
  const scoreFrac = (clampedScore - 300) / 600;
  const needleAngle = 180 - scoreFrac * 180;
  const needleTip = polarToCartesian(cx, cy, r - 15, needleAngle);

  const formattedDate = new Date(report.asOf * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      role="region"
      aria-label="Buyer credit score"
      className={`rounded-2xl border border-line bg-surface p-6 text-ink ${className}`}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Credit <span className="pl-serif text-accent">score</span></h2>
            <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-mono text-ink-muted">
              {copy.creditScore.scale}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">{report.model}</p>
        </div>
        <div className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted">{copy.creditScore.asOf(formattedDate)}</div>
      </div>

      {/* Main Gauge and Numbers Grid */}
      <div className="mt-4 grid grid-cols-1 items-center gap-6 md:grid-cols-12">
        {/* Semicircle SVG Gauge */}
        <div className="flex flex-col items-center md:col-span-5">
          <div className="relative w-full max-w-[240px]">
            <svg viewBox="0 -14 240 150" className="w-full overflow-visible" aria-hidden="true">
              {/* Three bands with a small gap between them; only the two outer ends are rounded. */}
              <path d={arcC} fill="none" stroke={isNew ? "var(--color-line)" : GAUGE.C} strokeWidth="16" />
              <path d={arcB} fill="none" stroke={isNew ? "var(--color-line)" : GAUGE.B} strokeWidth="16" />
              <path d={arcA} fill="none" stroke={isNew ? "var(--color-line)" : GAUGE.A} strokeWidth="16" />
              <circle cx={cx - r} cy={cy} r="8" fill={isNew ? "var(--color-line)" : GAUGE.C} />
              <circle cx={cx + r} cy={cy} r="8" fill={isNew ? "var(--color-line)" : GAUGE.A} />

              {/* Scale labels sit outside the arc so they never cover it. */}
              {[
                { v: 300, a: 180 },
                { v: 650, a: 75 },
                { v: 750, a: 45 },
                { v: 900, a: 0 },
              ].map(({ v, a }) => {
                const edge = a === 180 || a === 0;
                const p = edge ? { x: a === 180 ? cx - r : cx + r, y: cy + 22 } : polarToCartesian(cx, cy, r + 20, a);
                return (
                  <text key={v} x={p.x.toFixed(1)} y={p.y.toFixed(1)} textAnchor="middle" dominantBaseline="middle" className="fill-[var(--color-ink-muted)] text-[10px]">
                    {v}
                  </text>
                );
              })}

              {/* Needle */}
              {!isNew && (
                <>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={needleTip.x.toFixed(2)}
                    y2={needleTip.y.toFixed(2)}
                    stroke="var(--color-ink)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <circle cx={cx} cy={cy} r="7" fill="var(--color-ink)" />
                  <circle cx={cx} cy={cy} r="2.5" fill="var(--color-surface)" />
                </>
              )}
            </svg>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="pl-serif text-[52px] leading-none text-ink">
              {report.score !== null ? report.score : copy.creditScore.noScore}
            </span>
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#161513]" style={{ background: isNew ? "var(--color-line)" : GAUGE[report.band as "A" | "B" | "C"] }}>
              {report.band === "New" ? "New" : "Band " + report.band}
            </span>
          </div>
        </div>

        {/* Counts & Key Stats Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:col-span-7">
          <div className="bg-[#dfe9d4] rounded-xl p-3 text-[#161513]">
            <div className="text-[11px] font-semibold tracking-[0.04em] uppercase opacity-65">On time</div>
            <div className="mt-1 text-2xl font-semibold">{report.counts.onTime}</div>
          </div>
          <div className="bg-[#f4ebc6] rounded-xl p-3 text-[#161513]">
            <div className="text-[11px] font-semibold tracking-[0.04em] uppercase opacity-65">Paid late</div>
            <div className="mt-1 text-2xl font-semibold">{report.counts.paidLate}</div>
          </div>
          <div className="bg-[#f4ebc6] rounded-xl p-3 text-[#161513]">
            <div className="text-[11px] font-semibold tracking-[0.04em] uppercase opacity-65">Late now</div>
            <div className="mt-1 text-2xl font-semibold">{report.counts.late}</div>
          </div>
          <div className="bg-[#f9cba9] rounded-xl p-3 text-[#161513]">
            <div className="text-[11px] font-semibold tracking-[0.04em] uppercase opacity-65">Defaulted</div>
            <div className="mt-1 text-2xl font-semibold">
              {report.counts.defaulted}
            </div>
          </div>
          <div className="rounded-xl bg-[#fe8a70] p-3 text-[#161513] sm:col-span-2">
            <div className="text-[11px] font-semibold tracking-[0.04em] uppercase opacity-65">Open exposure</div>
            <div className="mt-1 text-2xl font-semibold">
              {formatUnits(report.openExposure)} HBAR
            </div>
          </div>
        </div>
      </div>

      {/* Factor Breakdown */}
      <div className="mt-6 border-t border-subtle pt-5">
        <h3 className="font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted uppercase">What makes up the score</h3>
        <div className="mt-2 divide-y divide-line">
          {report.factors.map((factor: CreditFactor) => {
            const isExpanded = !!expandedFactors[factor.key];
            const pct = Math.round(factor.value * 100);
            const weightPct = Math.round(factor.weight * 100);

            // Progress bar color based on factor performance
            const barColor =
              factor.value >= 0.8
                ? GAUGE.A
                : factor.value >= 0.5
                  ? GAUGE.B
                  : GAUGE.C;

            return (
              <div key={factor.key} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{factor.label}</span>
                    <span className="rounded-full border border-line px-2 py-px text-[11px] text-ink-muted">
                      {weightPct}% weight
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                      {copy.creditScore.points(factor.points)}
                    </span>
                    <span className="text-xs text-ink-muted">{pct}%</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-subtle">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: barColor }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                  <span>{factor.detail}</span>
                  {factor.evidence.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleEvidence(factor.key)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline focus:outline-none"
                    >
                      <span>
                        {isExpanded
                          ? copy.creditScore.evidence.hide
                          : `${copy.creditScore.evidence.show} (${factor.evidence.length})`}
                      </span>
                      <ChevronDown
                        className={`size-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>

                {/* Evidence links */}
                {isExpanded && factor.evidence.length > 0 && (
                  <div className="mt-2.5 border-t border-subtle/70 pt-2">
                    <div className="text-[11px] font-medium text-ink-muted mb-1.5">
                      On-chain proof (driving invoices):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {factor.evidence.map((invId) => (
                        <Link
                          key={invId}
                          href={`/invoice/${invId}`}
                          className="inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-0.5 text-xs font-mono text-ink hover:border-accent hover:text-accent transition-colors"
                        >
                          <span>Invoice #{invId}</span>
                          <ExternalLink className="size-3 text-ink-muted" aria-hidden="true" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Collapsible "How this score works" section */}
      <div className="mt-6">
        <Section
          title={copy.creditScore.howItWorks.title}
          hint="Deterministic on-chain model · 5 factors · 300–900 scale"
          open={false}
        >
          <div className="space-y-3 text-xs leading-relaxed text-ink-soft">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 text-status-paid shrink-0" aria-hidden="true" />
              <p>{copy.creditScore.howItWorks.description}</p>
            </div>
            <p className="font-medium text-ink">{copy.creditScore.howItWorks.factorsIntro}</p>
            <ul className="list-disc pl-4 space-y-1.5 text-ink-muted">
              <li>{copy.creditScore.howItWorks.factor1}</li>
              <li>{copy.creditScore.howItWorks.factor2}</li>
              <li>{copy.creditScore.howItWorks.factor3}</li>
              <li>{copy.creditScore.howItWorks.factor4}</li>
              <li>{copy.creditScore.howItWorks.factor5}</li>
            </ul>
            <p className="rounded-md bg-subtle p-2 text-ink-muted font-mono">{copy.creditScore.howItWorks.newRule}</p>
          </div>
        </Section>
      </div>
    </div>
  );
}
