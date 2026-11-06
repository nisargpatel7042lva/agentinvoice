import { ApprovalCard } from "@/components/ApprovalCard";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { loadEnsByVault } from "@/lib/agents";
import { copy } from "@/lib/copy";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const approval = await api.getApproval(id).catch(() => null);
  if (!approval) return <EmptyState message={copy.error.generic} action={{ label: copy.nav.backMarket, href: "/" }} />;
  const invoice = await api.getInvoice(approval.invoiceId).catch(() => null);
  const ens = invoice ? await loadEnsByVault(invoice.buyerVault) : { kind: "missing" as const };
  const agent = "agent" in ens ? ens.agent : undefined;

  return (
    <div className="grid max-w-xl gap-6">
      <h1 className="text-2xl font-semibold">{copy.approval.title}</h1>
      <ApprovalCard
        approval={approval}
        agentName={agent?.name ?? invoice?.buyerVault ?? "?"}
        amount={invoice?.faceAmount ?? "0"}
        threshold={agent?.threshold ?? "0"}
      />
    </div>
  );
}
