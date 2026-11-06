"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FilePlus2, LayoutList, UserRound, Waypoints, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";

const links: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { href: "/market", label: copy.nav.market, icon: LayoutList, match: (p) => p.startsWith("/market") || p.startsWith("/invoice") },
  { href: "/supplier", label: copy.nav.supplier, icon: FilePlus2, match: (p) => p.startsWith("/supplier") },
  { href: "/network", label: "Network", icon: Waypoints, match: (p) => p.startsWith("/network") || p.startsWith("/agent") || p.startsWith("/approval") },
  { href: "/profile", label: "Profile", icon: UserRound, match: (p) => p.startsWith("/profile") },
];

/** Main navigation. "side" is the desktop sidebar list; "bar" is the scrollable row on small screens. */
export function NavLinks({ variant = "side" }: { variant?: "side" | "bar" }) {
  const path = usePathname() ?? "/";
  return (
    <ul className={cn("text-sm", variant === "side" ? "flex flex-col gap-0.5" : "flex gap-1 overflow-x-auto")}>
      {links.map(({ href, label, icon: Icon, match }) => {
        const active = match(path);
        return (
          <li key={href} className="flex-none">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg font-medium transition-colors",
                variant === "side" ? "px-2.5 py-2" : "px-3 py-1.5",
                active ? "bg-surface text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-ink-muted hover:bg-subtle hover:text-ink",
              )}
            >
              <Icon aria-hidden="true" className={cn("size-4", active ? "text-accent" : "")} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
