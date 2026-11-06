"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Invoice, ScoreBand } from "@agentinvoice/shared";
import { buttonVariants, Table, TableBox, Td, Th } from "@/components/ui";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { Term } from "@/components/Term";
import { cn } from "@/lib/cn";
import { copy } from "@/lib/copy";
import { discountPct, formatAmount, formatDate, shortHex } from "@/lib/format";

export interface MarketRow {
  invoice: Invoice;
  buyerName?: string;
  sponsorName?: string;
  band?: ScoreBand;
  score?: number | null;
}

// Open first: that is what a new visitor can act on. Everything else is one click away.
const FILTERS = ["Open", "All", "Funded", "Paid", "Late", "Defaulted"] as const;

function returnPct(inv: Invoice): string {
  const price = BigInt(inv.price);
  if (price === 0n) return "0.0%";
  return `+${((Number(BigInt(inv.faceAmount) - price) / Number(price)) * 100).toFixed(1)}%`;
}

export function MarketTable({ rows }: { rows: MarketRow[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Open");
  const [minScore, setMinScore] = useState<number>(0);
  const [q, setQ] = useState("");
  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (filter === "All" || r.invoice.status === filter) &&
          (!minScore || (r.score != null && r.score >= minScore)) &&
          (!q || (r.buyerName ?? r.invoice.buyerVault).toLowerCase().includes(q.toLowerCase())),
      ),
    [rows, filter, minScore, q],
  );
  const showStatus = filter !== "Open";

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-0.5 rounded-lg bg-subtle p-[3px]">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn("h-[30px] rounded-md px-3 text-[13px] font-medium", filter === f ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink")}
            >
              {f === "All" ? copy.market.filterAll : f === "Open" ? "Ready to fund" : f}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            aria-label={copy.creditScore.minScoreFilter}
            className="h-9 rounded-lg border border-line bg-surface px-2.5 text-xs text-ink font-medium outline-none"
          >
            <option value={0}>{copy.creditScore.filterAny}</option>
            <option value={650}>{copy.creditScore.filter650}</option>
            <option value={750}>{copy.creditScore.filter750}</option>
          </select>
          <label className="flex h-9 min-w-[200px] items-center gap-2 rounded-lg border border-line px-3 text-sm text-ink-muted">
            <Search aria-hidden="true" className="size-4" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by buyer name" aria-label="Search by buyer name" className="w-full bg-transparent text-ink outline-none" />
          </label>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-ink-muted">{filter === "Open" ? copy.empty.market : "Nothing here yet."}</p>
      ) : (
        <>
          <TableBox className="hidden md:block">
            <Table className="min-w-[760px]">
              <thead>
                <tr>
                  <Th>Buyer</Th>
                  <Th><Term explain="score">Score</Term></Th>
                  <Th className="text-right">{copy.deal.youPay}</Th>
                  <Th className="text-right">{copy.deal.youGet}</Th>
                  <Th className="text-right">{copy.deal.return}</Th>
                  <Th>{copy.invoice.due}</Th>
                  {showStatus && <Th>{copy.market.col.status}</Th>}
                  <Th><span className="sr-only">Action</span></Th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ invoice: inv, buyerName, band, score }) => (
                  <tr key={inv.id} className="hover:bg-canvas">
                    <Td>
                      <Link href={`/agent/${inv.buyerVault}`} className="flex items-center gap-2.5">
                        <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-subtle text-[11px] font-semibold text-ink-soft">
                          {(buyerName ?? inv.buyerVault.slice(2)).slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-medium text-ink">{buyerName ?? shortHex(inv.buyerVault)}</span>
                      </Link>
                    </Td>
                    <Td>{band && <ScoreBadge band={band} score={score} />}</Td>
                    <Td className="text-right font-semibold">{formatAmount(inv.price)}</Td>
                    <Td className="text-right">{formatAmount(inv.faceAmount)}</Td>
                    <Td className="text-right font-medium text-status-paid">{returnPct(inv)}</Td>
                    <Td className="text-ink-soft">{formatDate(inv.dueDate)}</Td>
                    {showStatus && <Td><StatusBadge status={inv.status} /></Td>}
                    <Td className="text-right">
                      <Link href={`/invoice/${inv.id}`} className={buttonVariants({ variant: inv.status === "Open" ? "outline-accent" : "ghost", size: "sm" })}>
                        {inv.status === "Open" ? "Fund" : "View"}
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableBox>

          <ul className="divide-y divide-subtle md:hidden">
            {shown.map(({ invoice: inv, buyerName, band, score }) => (
              <li key={inv.id}>
                <Link href={`/invoice/${inv.id}`} className="block px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-ink">{buyerName ?? shortHex(inv.buyerVault)}</span>
                    {showStatus ? <StatusBadge status={inv.status} /> : band && <ScoreBadge band={band} score={score} />}
                  </div>
                  <p className="mt-1.5 text-sm text-ink-soft">
                    Pay <span className="font-semibold text-ink">{formatAmount(inv.price)}</span>, get{" "}
                    <span className="font-semibold text-ink">{formatAmount(inv.faceAmount)}</span> on {formatDate(inv.dueDate)}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-status-paid">{returnPct(inv)} return · {discountPct(inv)} discount</p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
