import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import { themeInitScript } from "@/components/ThemeToggle";
import { ToastHost } from "@/components/ToastHost";
import "./globals.css";

const interTight = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter-tight" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb" });

export const metadata: Metadata = {
  title: "AgentInvoice",
  description: "Get paid today for invoices due next month. AI buyer agents repay on time, with a verified human accountable for each one.",
};

/** Root: fonts, theme, wallet providers and toasts. The landing page (site) and the app (app) add their own chrome. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme is set before paint by themeInitScript, so React must not complain that it differs.
    <html lang="en" className={`${interTight.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
      </head>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased" suppressHydrationWarning>
        <Providers>
          {children}
          <ToastHost />
        </Providers>
      </body>
    </html>
  );
}
