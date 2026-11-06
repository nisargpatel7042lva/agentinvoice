import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { NavLinks } from "@/components/NavLinks";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WalletButton } from "@/components/WalletButton";
import { copy } from "@/lib/copy";
import { isMock } from "@/lib/env";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.02em] text-ink">
      <BrandMark />
      {copy.nav.brand}
    </Link>
  );
}

/** App chrome, laid out like a banking dashboard: sidebar on the left, wallet top right, content in the middle. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-sidebar px-3 py-5 lg:flex">
        <div className="px-2.5">
          <Brand />
        </div>
        <nav aria-label="Main" className="mt-8">
          <NavLinks />
        </nav>
        <div className="mt-auto flex flex-col gap-3 px-2.5 text-xs text-ink-muted">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-good" />
            Hedera testnet
          </span>
          <p className="leading-relaxed">
            {copy.banner.testnet}
            {isMock ? ` ${copy.banner.mock}` : ""}
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 md:px-8">
            <div className="lg:hidden">
              <Brand />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <WalletButton />
            </div>
          </div>
          <nav aria-label="Main" className="border-t border-line px-3 py-2 lg:hidden">
            <NavLinks variant="bar" />
          </nav>
        </header>
        {isMock && <p className="border-b border-line bg-subtle px-4 py-1.5 text-center text-xs text-ink-muted lg:hidden">{copy.banner.mock}</p>}
        <main className="mx-auto max-w-[1160px] px-4 pt-8 pb-20 md:px-8">{children}</main>
      </div>
    </div>
  );
}
