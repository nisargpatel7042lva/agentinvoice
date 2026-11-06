import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { isMock } from "@/lib/api";
import { copy } from "@/lib/copy";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentInvoice",
  description: "Fund invoices from AI buyer agents with a named, accountable sponsor.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <div className="flex h-8 items-center justify-center bg-ink px-4 text-xs text-white">
          {copy.banner.testnet}
          {isMock ? ` ${copy.banner.mock}` : ""}
        </div>
        <header className="border-b border-line bg-surface">
          <nav className="mx-auto flex h-14 max-w-[1120px] items-center gap-6 px-4 md:px-8">
            <Link href="/" className="font-semibold text-ink">
              {copy.nav.brand}
            </Link>
            <Link href="/" className="text-sm text-ink-muted hover:text-ink">
              {copy.nav.market}
            </Link>
            <Link href="/supplier" className="text-sm text-ink-muted hover:text-ink">
              {copy.nav.supplier}
            </Link>
            <span className="ml-auto rounded-md border border-line px-3 py-1.5 text-sm text-ink-muted">{copy.wallet.connect}</span>
          </nav>
        </header>
        <main className="mx-auto max-w-[1120px] px-4 py-8 md:px-8">{children}</main>
      </body>
    </html>
  );
}
