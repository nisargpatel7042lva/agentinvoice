import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { NavLinks } from "@/components/NavLinks";
import { ThemeToggle, themeInitScript } from "@/components/ThemeToggle";
import { isMock } from "@/lib/api";
import { copy } from "@/lib/copy";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb" });

export const metadata: Metadata = {
  title: "AgentInvoice",
  description: "Fund invoices from AI buyer agents with a named, accountable sponsor.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme is set before paint by themeInitScript, so React must not complain that it differs.
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <div className="border-b border-line bg-subtle px-4 py-1.5 text-center text-xs text-ink-muted">
          {copy.banner.testnet}
          {isMock ? ` ${copy.banner.mock}` : ""}
        </div>
        <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
          <nav className="mx-auto flex min-h-15 max-w-[1240px] flex-wrap items-center gap-x-7 gap-y-2 px-4 py-2 md:px-6">
            <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
              <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-on-accent">AI</span>
              {copy.nav.brand}
            </Link>
            <NavLinks />
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft sm:flex">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-good" />
                Hedera testnet
              </span>
              <ThemeToggle />
              <span className="flex h-9 items-center rounded-lg bg-ink px-3.5 text-sm font-medium text-canvas">{copy.wallet.connect}</span>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-[1240px] px-4 pt-8 pb-16 md:px-6">{children}</main>
      </body>
    </html>
  );
}
