"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, ShieldCheck } from "lucide-react";
import { formatUnits, type CreditFactor, type CreditReport } from "@agentinvoice/shared";
import { copy } from "@/lib/copy";
import { ScoreBadge } from "./ScoreBadge";
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
  const arcC = describeArc(cx, cy, r, 180, 75);
  const arcB = describeArc(cx, cy, r, 75, 45);
  const arcA = describeArc(cx, cy, r, 45, 0);

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
      className={`rounded-xl border border-line bg-surface p-5 text-ink shadow-card ${className}`}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-ink">{copy.creditScore.title}</h2>
            <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-mono text-ink-muted">
              {copy.creditScore.scale}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">{report.summary}</p>
        </div>
        <div className="text-xs text-ink-muted font-mono">{copy.creditScore.asOf(formattedDate)}</div>
      </div>

      {/* Main Gauge and Numbers Grid */}
      <div className="mt-4 grid grid-cols-1 items-center gap-6 md:grid-cols-12">
        {/* Semicircle SVG Gauge */}
        <div className="flex flex-col items-center md:col-span-5">
          <div className="relative w-full max-w-[240px]">
            <svg viewBox="0 0 240 130" className="w-full overflow-visible" aria-hidden="true">
              {/* Arc C */}
              <path
                d={arcC}
                fill="none"
                stroke={isNew ? "var(--color-status-pending)" : "var(--color-band-c)"}
                strokeWidth="14"
                strokeLinecap="round"
                className="opacity-90"
              />
              {/* Arc B */}
              <path
                d={arcB}
                fill="none"
                stroke={isNew ? "var(--color-status-pending)" : "var(--color-band-b)"}
                strokeWidth="14"
                className="opacity-90"
              />
              {/* Arc A */}
              <path
                d={arcA}
                fill="none"
                stroke={isNew ? "var(--color-status-pending)" : "var(--color-band-a)"}
                strokeWidth="14"
                strokeLinecap="round"
                className="opacity-90"
              />

              {/* Ticks and scale labels */}
              <text x="24" y="124" className="text-[10px] font-mono fill-[var(--color-ink-muted)] text-center">
                300
              </text>
              <text x="135" y="24" className="text-[10px] font-mono fill-[var(--color-ink-muted)] text-center">
                650
              </text>
              <text x="180" y="44" className="text-[10px] font-mono fill-[var(--color-ink-muted)] text-center">
                750
              </text>
              <text x="204" y="124" className="text-[10px] font-mono fill-[var(--color-ink-muted)] text-center">
                900
              </text>

              {/* Needle */}
              {!isNew && (
                <>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={needleTip.x}
                    y2={needleTip.y}
                    stroke="var(--color-ink)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  <circle cx={cx} cy={cy} r="5" fill="var(--color-ink)" />
                </>
              )}
            </svg>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-ink">
              {report.score !== null ? report.score : copy.creditScore.noScore}
            </span>
            <ScoreBadge band={report.band} score={report.score} />
          </div>
        </div>

        {/* Counts & Key Stats Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:col-span-7">
          <div className="rounded-lg border border-subtle bg-subtle/50 p-2.5">
            <div className="text-[11px] font-medium text-ink-muted">On time</div>
            <div className="mt-1 text-base font-semibold font-mono text-status-paid">{report.counts.onTime}</div>
          </div>
          <div className="rounded-lg border border-subtle bg-subtle/50 p-2.5">
            <div className="text-[11px] font-medium text-ink-muted">Paid late</div>
            <div className="mt-1 text-base font-semibold font-mono text-status-late">{report.counts.paidLate}</div>
          </div>
          <div className="rounded-lg border border-subtle bg-subtle/50 p-2.5">
            <div className="text-[11px] font-medium text-ink-muted">Late now</div>
            <div className="mt-1 text-base font-semibold font-mono text-status-late">{report.counts.late}</div>
          </div>
          <div className="rounded-lg border border-subtle bg-subtle/50 p-2.5">
            <div className="text-[11px] font-medium text-ink-muted">Defaulted</div>
            <div className="mt-1 text-base font-semibold font-mono text-status-defaulted">
              {report.counts.defaulted}
            </div>
          </div>
          <div className="rounded-lg border border-subtle bg-subtle/50 p-2.5 sm:col-span-2">
            <div className="text-[11px] font-medium text-ink-muted">Open exposure</div>
            <div className="mt-1 text-base font-semibold font-mono text-ink">
              {formatUnits(report.openExposure)} HBAR
            </div>
          </div>
        </div>
      </div>

      {/* Factor Breakdown */}
      <div className="mt-6 border-t border-subtle pt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Factor Breakdown (5 on-chain dimensions)
        </h3>
        <div className="mt-3 space-y-4">
          {report.factors.map((factor: CreditFactor) => {
            const isExpanded = !!expandedFactors[factor.key];
            const pct = Math.round(factor.value * 100);
            const weightPct = Math.round(factor.weight * 100);

            // Progress bar color based on factor performance
            const barColor =
              factor.value >= 0.8
                ? "var(--color-band-a)"
                : factor.value >= 0.5
                  ? "var(--color-band-b)"
                  : "var(--color-band-c)";

            return (
              <div key={factor.key} className="rounded-lg border border-line/60 bg-subtle/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{factor.label}</span>
                    <span className="rounded-full bg-subtle px-1.5 py-0.2 text-[10px] font-mono text-ink-muted">
                      {weightPct}% weight
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-ink">
                      {copy.creditScore.points(factor.points)}
                    </span>
                    <span className="text-xs font-mono text-ink-muted">({pct}%)</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
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
