import { ApprovalActions } from "@/components/ApprovalActions";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import { loadEnsByVault } from "@/lib/agents";
import { copy } from "@/lib/copy";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const approval = await api.getApproval(id).catch(() => null);
  if (!approval) return <EmptyState message="We could not find this approval request." action={{ label: copy.nav.backMarket, href: "/" }} />;
  const invoice = await api.getInvoice(approval.invoiceId).catch(() => null);
  const ens = invoice ? await loadEnsByVault(invoice.buyerVault) : { kind: "missing" as const };
  const agent = "agent" in ens ? ens.agent : undefined;

  return (
    <div className="mx-auto grid max-w-xl gap-5">
      <div>
        <h1 className="text-[28px] leading-9 font-semibold tracking-tight">{copy.approval.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">You are the sponsor: the person responsible for this buyer agent.</p>
      </div>
      <ApprovalActions
        approval={approval}
        agentName={agent?.name ?? invoice?.buyerVault ?? "The buyer agent"}
        amount={invoice?.faceAmount ?? "0"}
        threshold={agent?.threshold ?? "0"}
      />
    </div>
  );
}
