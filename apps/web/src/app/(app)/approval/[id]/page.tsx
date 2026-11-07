import { PageHeader } from "@/components/PageHeader";
import { ApprovalActions } from "@/components/ApprovalActions";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { loadEnsByVault, registeredNames } from "@/lib/agents";
import { readApprovalThreshold } from "@/lib/credit";
import { copy } from "@/lib/copy";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const approval = await api.getApproval(id).catch(() => null);
  if (!approval) return <EmptyState message="We could not find this approval request." action={{ label: copy.nav.backMarket, href: "/market" }} />;
  const invoice = await api.getInvoice(approval.invoiceId).catch(() => null);
  const ens = invoice ? await loadEnsByVault(invoice.buyerVault) : { kind: "missing" as const };
  const agent = "agent" in ens ? ens.agent : undefined;
  // A vault registered on the website has no ENS limit record, so read the threshold from the vault and the name from the registry.
  const threshold = agent?.threshold ?? (invoice ? await readApprovalThreshold(invoice.buyerVault) : null) ?? "0";
  const registered = invoice ? (await registeredNames()).get(invoice.buyerVault.toLowerCase()) : undefined;

  return (
    <div className="grid max-w-xl gap-6">
      <PageHeader title={copy.approval.title} sub="You are the sponsor: the person responsible for this buyer agent." />
      <ApprovalActions
        approval={approval}
        agentName={agent?.name ?? registered ?? invoice?.buyerVault ?? "The buyer agent"}
        amount={invoice?.faceAmount ?? "0"}
        threshold={threshold}
      />
    </div>
  );
}
