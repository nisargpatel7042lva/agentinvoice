import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { NavLinks } from "@/components/NavLinks";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WalletButton } from "@/components/WalletButton";
import { NameOnboarding } from "@/components/NameOnboarding";
import { copy } from "@/lib/copy";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { marketStats } from "@/lib/stats";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.02em] text-ink">
      <BrandMark />
      {copy.nav.brand}
    </Link>
  );
}

/** App chrome, laid out like a banking dashboard: sidebar on the left, wallet top right, content in the middle. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const invoices = await api.listInvoices().catch(() => null);
  const s = invoices ? marketStats(invoices) : null;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sb sticky top-0 hidden h-screen flex-col overflow-hidden border-r border-line bg-sidebar px-3 py-5 lg:flex">
        <div className="px-2">
          <Brand />
        </div>

        <p className="mt-9 px-2 font-mono text-[10.5px] font-medium tracking-[0.12em] text-ink-faint uppercase">Portal</p>
        <nav aria-label="Main" className="mt-2">
          <NavLinks />
        </nav>

        {s && (
          <Link href="/market" className="pl-card pl-dark pl-lift group mt-auto block p-4" style={{ ["--d" as string]: "0.15s" }}>
            <span className="flex items-center justify-between text-[11px] text-white/60">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#9be29b] opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-[#9be29b]" />
                </span>
                Live market
              </span>
              {s.onTimePct != null && <span>{Math.round(s.onTimePct)}% on time</span>}
            </span>
            <span className="mt-3 block">
              <span className="pl-serif text-[40px] leading-none">{s.openCount}</span>
              <span className="ml-1.5 text-sm text-white/75">ready to fund</span>
            </span>
            <span className="mt-3 flex items-center justify-between border-t border-white/15 pt-2.5 text-xs">
              <span className="text-white/60">{formatAmount(s.openFace.toString())} face value</span>
              <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        )}

        <div className={(s ? "mt-4" : "mt-auto") + " flex items-center justify-between gap-2 px-2"}>
          <span className="flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] text-ink-soft">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-good" />
            Hedera testnet
          </span>
        </div>
        <p className="mt-2.5 px-2 text-[11px] leading-relaxed text-ink-faint">{copy.banner.testnet}</p>
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
        <main className="mx-auto max-w-[1160px] px-4 pt-8 pb-20 md:px-8">{children}</main>
        <NameOnboarding />
      </div>
    </div>
  );
}
