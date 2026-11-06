import { PageHeader } from "@/components/PageHeader";
import { ApprovalActions } from "@/components/ApprovalActions";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { loadEnsByVault } from "@/lib/agents";
import { copy } from "@/lib/copy";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const approval = await api.getApproval(id).catch(() => null);
  if (!approval) return <EmptyState message="We could not find this approval request." action={{ label: copy.nav.backMarket, href: "/market" }} />;
  const invoice = await api.getInvoice(approval.invoiceId).catch(() => null);
  const ens = invoice ? await loadEnsByVault(invoice.buyerVault) : { kind: "missing" as const };
  const agent = "agent" in ens ? ens.agent : undefined;

  return (
    <div className="grid max-w-xl gap-6">
      <PageHeader title={copy.approval.title} sub="You are the sponsor: the person responsible for this buyer agent." />
      <ApprovalActions
        approval={approval}
        agentName={agent?.name ?? invoice?.buyerVault ?? "The buyer agent"}
        amount={invoice?.faceAmount ?? "0"}
        threshold={agent?.threshold ?? "0"}
      />
    </div>
  );
}
