// shadcn/ui-style primitives (same API shape as shadcn's Button, Card, Badge, Table, Progress),
// styled with our tokens from docs/design/tokens.md. No gradients.
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium tracking-[-0.01em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
  {
    variants: {
      variant: {
        // Primary: solid ink. One per screen, always in the page header or the sticky summary.
        default: "bg-ink text-canvas hover:bg-ink-soft",
        // Coral: the landing page's main call to action only.
        hot: "bg-hot text-[#161513] hover:brightness-95",
        dark: "bg-ink text-canvas hover:bg-ink-soft",
        outline: "border border-line bg-surface text-ink hover:bg-subtle",
        "outline-accent": "border border-accent text-accent hover:bg-accent-soft",
        ghost: "text-ink-soft hover:bg-subtle",
      },
      size: { default: "h-10 px-4", sm: "h-8 px-3 text-[13px]", lg: "h-12 px-5 text-[15px]", xl: "h-14 px-6 text-base" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({ className, variant, size, ...props }: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-line bg-surface", className)} {...props} />;
}
export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-baseline justify-between gap-2 px-6 pt-5", className)} {...props} />;
}
export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-base font-semibold", className)} {...props} />;
}
export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-6 pt-4 pb-6", className)} {...props} />;
}

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold", className)} {...props} />;
}

export function Progress({ value, className, barClassName, label }: { value: number; className?: string; barClassName?: string; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} className={cn("h-2 overflow-hidden rounded-full bg-subtle", className)}>
      <div className={cn("h-2 bg-accent", barClassName)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function TableBox({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("overflow-x-auto", className)} {...props} />;
}
export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={cn("w-full border-collapse text-sm", className)} {...props} />;
}
export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("border-b border-line px-4 py-2.5 text-left text-xs font-medium text-ink-muted", className)} {...props} />;
}
export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-t border-subtle px-4 py-3.5", className)} {...props} />;
}

export function StatCard({ label, value, sub, children, className }: { label: string; value: React.ReactNode; sub?: string; children?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="text-[13px] text-ink-muted">{label}</div>
      <div className="mt-2 text-[26px] leading-8 font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-muted">{sub}</div>}
      {children && <div className="mt-3">{children}</div>}
    </Card>
  );
}
