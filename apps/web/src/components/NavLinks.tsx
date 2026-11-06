"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";

const links = [
  { href: "/market", label: copy.nav.market, match: (p: string) => p.startsWith("/market") || p.startsWith("/invoice") },
  { href: "/network", label: "Network", match: (p: string) => p.startsWith("/network") || p.startsWith("/agent") },
  { href: "/supplier", label: copy.nav.supplier, match: (p: string) => p.startsWith("/supplier") },
];

export function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <div className="flex gap-1 text-sm">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.match(path) ? "page" : undefined}
          className={cn("rounded-full px-3.5 py-1.5 font-medium transition-colors", l.match(path) ? "bg-subtle text-ink" : "text-ink-muted hover:text-ink")}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
