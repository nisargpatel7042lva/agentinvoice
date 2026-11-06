import Link from "next/link";
import { payPolicyFixture, type Address } from "@agentinvoice/shared";
import { Card } from "@/components/Card";
import { EnsPanel } from "@/components/EnsPanel";
import { PolicyPanel } from "@/components/PolicyPanel";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { TxLink } from "@/components/TxLink";
import { api, isMock } from "@/lib/api";
import { loadEnsByVault, loadScore } from "@/lib/agents";
import { copy } from "@/lib/copy";
import { formatAmount } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ vault: string }> }) {
  const { vault } = await params;
  const [ens, score, invoices] = await Promise.all([
    loadEnsByVault(vault),
    loadScore(vault),
    api.listInvoices().catch(() => []),
  ]);
  const agent = "agent" in ens ? ens.agent : undefined;
  const mine = invoices.filter((i) => i.buyerVault.toLowerCase() === vault.toLowerCase());

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{agent?.name ?? vault}</h1>
        {score && <ScoreBadge band={score.band} value={score.band === "New" ? null : score.onTimeRate} />}
        <span className="text-sm text-ink-muted">
          <TxLink address={vault as Address} />
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Policy values come from the vault contract; in mock mode we show the sample policy. */}
        {isMock && agent ? (
          <PolicyPanel policy={payPolicyFixture} dailyLimit={agent.limit} threshold={agent.threshold} spentToday="1200000000" allowedSuppliers={3} />
        ) : (
          <Card title={copy.policy.title}><p className="text-sm text-ink-muted">{copy.error.backendDown}</p></Card>
        )}
        <EnsPanel state={ens} vaultOnChain={vault as Address} />
      </div>

      <Card title={copy.invoice.history}>
        {mine.length === 0 ? (
          <p className="text-sm text-ink-muted">{copy.empty.agentHistory}</p>
        ) : (
          <ul className="text-sm">
            {mine.map((i) => (
              <li key={i.id} className="flex items-center justify-between border-b border-line py-2 last:border-0">
                <Link href={`/invoice/${i.id}`} className="text-accent">{copy.invoice.title(i.id)}</Link>
                <span className="flex items-center gap-3">{formatAmount(i.faceAmount)} <StatusBadge status={i.status} /></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
