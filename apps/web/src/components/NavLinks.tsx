"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";

const links = [
  { href: "/", label: copy.nav.market, match: (p: string) => p === "/" || p.startsWith("/invoice") },
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
          className={cn("rounded-md px-3 py-1.5", l.match(path) ? "bg-subtle font-medium text-ink" : "text-ink-muted hover:text-ink")}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
