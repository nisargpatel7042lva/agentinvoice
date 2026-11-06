import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { NavLinks } from "@/components/NavLinks";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WalletButton } from "@/components/WalletButton";
import { copy } from "@/lib/copy";
import { isMock } from "@/lib/env";

/** App chrome: a soft glow at the top, the floating pill nav, and the content column. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      {/* Quiet echo of the landing page's bowl glow, so the app feels like the same product. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[340px] bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_srgb,var(--color-glow)_45%,transparent),color-mix(in_srgb,var(--color-accent-200)_35%,transparent)_45%,transparent_75%)]" />

      <header className="sticky top-3 z-30 px-3 md:top-5 md:px-6">
        <nav aria-label="Main" className="mx-auto flex min-h-[56px] max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 rounded-full border border-line/60 bg-surface/90 py-2 pr-2 pl-5 shadow-card backdrop-blur">
          <Link href="/" className="flex items-center gap-2.5 text-[17px] font-medium tracking-[-0.02em] text-ink">
            <BrandMark />
            {copy.nav.brand}
          </Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft lg:flex">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-good" />
              Hedera testnet
            </span>
            <ThemeToggle />
            <WalletButton />
          </div>
        </nav>
        <p className="mx-auto mt-2 max-w-[1240px] text-center text-xs text-ink-muted">
          {copy.banner.testnet}
          {isMock ? ` ${copy.banner.mock}` : ""}
        </p>
      </header>

      <main className="relative mx-auto max-w-[1240px] px-4 pt-6 pb-16 md:px-6">{children}</main>
    </div>
  );
}
