"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FilePlus2, LayoutList, UserRound, Waypoints, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";

// Each page keeps its banner hue (landing verbs): apricot Fund, lemon Sell, lilac Verify, sage Pay.
const links: { href: string; label: string; hint: string; icon: LucideIcon; tile: string; glow: string; match: (p: string) => boolean }[] = [
  { href: "/market", label: copy.nav.market, hint: "Fund invoices", icon: LayoutList, tile: "#f9cba9", glow: "rgb(249 150 84 / 0.22)", match: (p) => p.startsWith("/market") || p.startsWith("/invoice") },
  { href: "/supplier", label: copy.nav.supplier, hint: "Get paid today", icon: FilePlus2, tile: "#f4e3a1", glow: "rgb(246 222 104 / 0.22)", match: (p) => p.startsWith("/supplier") },
  { href: "/network", label: "Network", hint: "Who owes whom", icon: Waypoints, tile: "#ecd0e0", glow: "rgb(222 150 200 / 0.22)", match: (p) => p.startsWith("/network") || p.startsWith("/agent") || p.startsWith("/approval") },
  { href: "/profile", label: "Profile", hint: "Your wallet", icon: UserRound, tile: "#d6e6cc", glow: "rgb(150 206 150 / 0.22)", match: (p) => p.startsWith("/profile") },
];

/** Main navigation. "side" is the desktop sidebar list; "bar" is the scrollable row on small screens. */
export function NavLinks({ variant = "side" }: { variant?: "side" | "bar" }) {
  const path = usePathname() ?? "/";
  return (
    <ul className={cn("text-sm", variant === "side" ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto")}>
      {links.map(({ href, label, hint, icon: Icon, tile, glow, match }) => {
        const active = match(path);
        return (
          <li key={href} className="flex-none">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              style={active && variant === "side" ? { background: "linear-gradient(90deg, " + glow + ", transparent 85%)" } : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl font-medium transition-colors",
                variant === "side" ? "px-2 py-1.5" : "px-2.5 py-1.5",
                active ? "text-ink" : "text-ink-muted hover:bg-subtle hover:text-ink",
              )}
            >
              {active && variant === "side" && <span aria-hidden="true" className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-hot" />}
              <span
                aria-hidden="true"
                style={{ background: tile }}
                className={cn(
                  "flex flex-none items-center justify-center rounded-lg text-[#161513] transition-transform group-hover:-rotate-6",
                  variant === "side" ? "size-8" : "size-6",
                  !active && "opacity-80 saturate-[.85] group-hover:opacity-100 group-hover:saturate-100",
                )}
              >
                <Icon className={variant === "side" ? "size-4" : "size-3.5"} />
              </span>
              {variant === "side" ? (
                <span className="min-w-0 leading-tight">
                  <span className="block">{label}</span>
                  <span className={cn("block text-[11.5px] font-normal", active ? "text-ink-muted" : "text-ink-faint")}>{hint}</span>
                </span>
              ) : (
                label
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
