"use client";

// Charts on Recharts (the library shadcn/ui Charts wraps). Flat fills only, no gradients.
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// CSS variables from the theme, so charts follow day/night mode.
const C = { accent: "var(--color-accent)", warn: "var(--color-warn)", danger: "var(--color-danger)", grid: "var(--color-subtle)", axis: "var(--color-ink-muted)" };
const tooltipStyle = { borderRadius: 8, border: "1px solid var(--color-line)", background: "var(--color-surface)", color: "var(--color-ink)", fontSize: 12, boxShadow: "var(--shadow-raised)" };

export function FaceByStatusChart({ data }: { data: { status: string; hbar: number }[] }) {
  return (
    <div role="img" aria-label={`Face value by status: ${data.map((d) => `${d.status} ${d.hbar} USDC`).join(", ")}`} className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="status" tickLine={false} axisLine={false} fontSize={12} stroke={C.axis} />
          <YAxis tickLine={false} axisLine={false} fontSize={12} stroke={C.axis} width={48} />
          <Tooltip cursor={{ fill: C.grid }} contentStyle={tooltipStyle} formatter={(v) => [`${v} USDC`, "Face value"]} />
          <Bar isAnimationActive={false} dataKey="hbar" fill={C.accent} radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Stacked on-time / late / defaulted counts per bucket (e.g. per due week). */
export function RepaymentChart({ data, height = 200 }: { data: { label: string; onTime: number; late: number; defaulted: number }[]; height?: number }) {
  const total = data.reduce((a, d) => ({ onTime: a.onTime + d.onTime, late: a.late + d.late, defaulted: a.defaulted + d.defaulted }), { onTime: 0, late: 0, defaulted: 0 });
  return (
    <div role="img" aria-label={`Repayments: ${total.onTime} on time, ${total.late} late, ${total.defaulted} defaulted`} className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke={C.axis} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke={C.axis} width={40} />
          <Tooltip cursor={{ fill: C.grid }} contentStyle={tooltipStyle} />
          <Bar isAnimationActive={false} dataKey="onTime" name="On time" stackId="r" fill={C.accent} maxBarSize={44} />
          <Bar isAnimationActive={false} dataKey="late" name="Late" stackId="r" fill={C.warn} maxBarSize={44} />
          <Bar isAnimationActive={false} dataKey="defaulted" name="Defaulted" stackId="r" fill={C.danger} radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: "accent" | "warn" | "danger" }[] }) {
  const bg = { accent: "bg-accent", warn: "bg-warn", danger: "bg-danger" };
  return (
    <div className="flex flex-wrap gap-4 text-xs text-ink-soft">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-2.5 rounded-sm ${bg[i.color]}`} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
