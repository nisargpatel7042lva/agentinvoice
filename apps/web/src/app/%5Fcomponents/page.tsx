// Component gallery at /_components (folder name is URL-encoded so Next routes it). Not linked from the nav.
import {
  STATUSES,
  SCORE_BANDS,
  approvalFixture,
  ensAgentFixture,
  invoiceFixtures,
  payPolicyFixture,
} from "@agentinvoice/shared";
import { ApprovalCard } from "@/components/ApprovalCard";
import { EmptyState } from "@/components/EmptyState";
import { EnsPanel } from "@/components/EnsPanel";
import { InvoiceCard } from "@/components/InvoiceCard";
import { PolicyPanel } from "@/components/PolicyPanel";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { TxLink } from "@/components/TxLink";
import { copy } from "@/lib/copy";

export default function ComponentsPage() {
  const expired = { ...ensAgentFixture, expiresAt: 1 };
  return (
    <div className="grid gap-8">
      <h1 className="text-2xl font-semibold">Components</h1>
      <section className="flex flex-wrap gap-2">{STATUSES.map((s) => <StatusBadge key={s} status={s} />)}</section>
      <section className="flex flex-wrap gap-2">{SCORE_BANDS.map((b) => <ScoreBadge key={b} band={b} value={b === "New" ? null : 80} />)}</section>
      <section><TxLink address={ensAgentFixture.vault} /></section>
      <section className="grid gap-4 md:grid-cols-2"><InvoiceCard invoice={invoiceFixtures[1]} band="A" buyerName={ensAgentFixture.name} /><EmptyState message={copy.empty.market} /></section>
      <PolicyPanel policy={payPolicyFixture} dailyLimit="5000000000" threshold="1000000000" spentToday="1200000000" allowedSuppliers={3} />
      <section className="grid gap-4 md:grid-cols-2">
        <EnsPanel state={{ kind: "present", agent: ensAgentFixture }} vaultOnChain={ensAgentFixture.vault} />
        <EnsPanel state={{ kind: "expired", agent: expired }} />
        <EnsPanel state={{ kind: "revoked" }} />
        <EnsPanel state={{ kind: "unreachable" }} />
        <EnsPanel state={{ kind: "missing" }} />
      </section>
      <ApprovalCard approval={approvalFixture} agentName={ensAgentFixture.name} amount="1200000000" threshold="1000000000" />
    </div>
  );
}
