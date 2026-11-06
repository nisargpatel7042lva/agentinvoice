import "server-only";
// TEMPORARY in-memory backend for the clickable UI (NEXT_PUBLIC_MOCK=1).
// Lives in the Next server process: it survives page loads and resets on server restart or "Reset demo data".
// Real data comes from services/backend + the contracts; see docs/notes/frontend-actions.md.
import {
  approvalFixture,
  auditFixtures,
  ensAgentFixture,
  invoiceFixtures,
  scoreFixtures,
  type Address,
  type Approval,
  type AuditEvent,
  type CreateInvoiceBody,
  type Invoice,
  type Status,
} from "@agentinvoice/shared";
import { sampleNetworkInvoices } from "./directory";

// Bump when the seed data changes, so a running dev server reseeds instead of keeping stale demo data.
const SEED_VERSION = 2;

interface State {
  version: number;
  invoices: Invoice[];
  audit: AuditEvent[]; // newest first, like GET /api/audit
  approvals: Approval[];
  nextId: number;
  nextSeq: number;
}

const fresh = (): State => ({
  version: SEED_VERSION,
  invoices: structuredClone([...invoiceFixtures, ...sampleNetworkInvoices]),
  audit: structuredClone(auditFixtures),
  approvals: [structuredClone(approvalFixture)],
  nextId: 100,
  nextSeq: Math.max(...auditFixtures.map((e) => e.sequenceNumber)) + 1,
});

// Kept on globalThis so Next dev hot-reload does not wipe the demo state on every edit.
const g = globalThis as unknown as { __aiMock?: State };
const s = (): State => {
  if (!g.__aiMock || g.__aiMock.version !== SEED_VERSION) g.__aiMock = fresh();
  return g.__aiMock;
};

export class MockError extends Error {}

function log(type: string, invoiceId: string | null, data: Record<string, unknown> = {}) {
  const st = s();
  st.audit.unshift({
    topicId: "0.0.5005",
    sequenceNumber: st.nextSeq++,
    consensusTimestamp: `${Math.floor(Date.now() / 1000)}.000000000`,
    type,
    invoiceId,
    data,
  });
}

function find(id: string): Invoice {
  const inv = s().invoices.find((i) => i.id === id);
  if (!inv) throw new MockError(`Invoice #${id} not found`);
  return inv;
}

function move(id: string, from: Status[], to: Status, event: string, data: Record<string, unknown> = {}): Invoice {
  const inv = find(id);
  if (!from.includes(inv.status)) throw new MockError(`Invoice #${id} is ${inv.status}; this needs ${from.join(" or ")}`);
  inv.status = to;
  log(event, id, data);
  return inv;
}

export const mockStore = {
  reset() {
    g.__aiMock = fresh();
  },

  // ---- reads (same shapes as the backend API) ----
  listInvoices: async (status?: Status) => s().invoices.filter((i) => !status || i.status === status),
  getInvoice: async (id: string) => find(id),
  listAudit: async () => s().audit,
  getApproval: async (id: string) => {
    const a = s().approvals.find((x) => x.id === id);
    if (!a) throw new MockError(`Approval ${id} not found`);
    return a;
  },
  getScoreMock: async (vault: string) => {
    const sc = scoreFixtures.find((x) => x.vault.toLowerCase() === vault.toLowerCase());
    if (!sc) throw new MockError(`No score for ${vault}`);
    return sc;
  },

  // ---- writes (each one mirrors a real contract call or backend route) ----
  createInvoice(body: CreateInvoiceBody, supplier: Address): Invoice {
    const st = s();
    const inv: Invoice = {
      id: String(st.nextId++),
      supplier,
      buyerVault: body.buyerVault,
      faceAmount: body.faceAmount,
      price: body.price,
      dueDate: body.dueDate,
      status: "Pending",
      bond: null,
      holder: null,
      evidenceHash: body.evidenceHash,
      description: body.description,
    };
    st.invoices.unshift(inv);
    log("invoice.created", inv.id, { supplier });
    return inv;
  },
  accept: (id: string) => move(id, ["Pending"], "Open", "invoice.accepted"),
  fund(id: string, investor: Address) {
    const inv = move(id, ["Open"], "Funded", "invoice.funded", { holder: investor });
    inv.holder = investor;
    inv.bond = "0x4444444444444444444444444444444444444444";
    return inv;
  },
  /** Pays the invoice, or opens a sponsor approval when the amount is above the buyer's threshold. */
  pay(id: string): { invoice: Invoice; approvalId?: string } {
    const inv = find(id);
    if (inv.status !== "Funded" && inv.status !== "Late") throw new MockError(`Invoice #${id} is ${inv.status}; it must be Funded or Late to pay`);
    const needsApproval = inv.buyerVault.toLowerCase() === ensAgentFixture.vault.toLowerCase() && BigInt(inv.faceAmount) > BigInt(ensAgentFixture.threshold);
    const approved = s().approvals.some((a) => a.invoiceId === id && a.state === "approved");
    if (needsApproval && !approved) {
      const existing = s().approvals.find((a) => a.invoiceId === id && a.state === "pending");
      if (existing) return { invoice: inv, approvalId: existing.id };
      const approval: Approval = { id: `appr_${Date.now().toString(36)}`, invoiceId: id, state: "pending", createdAt: Math.floor(Date.now() / 1000), decidedAt: null };
      s().approvals.push(approval);
      log("approval.requested", id, { approvalId: approval.id });
      return { invoice: inv, approvalId: approval.id };
    }
    return { invoice: move(id, ["Funded", "Late"], "Paid", "invoice.paid") };
  },
  markLate: (id: string) => move(id, ["Funded"], "Late", "invoice.late"),
  markDefaulted: (id: string) => move(id, ["Late"], "Defaulted", "invoice.defaulted"),
  decideApproval(id: string, approve: boolean) {
    const a = s().approvals.find((x) => x.id === id);
    if (!a) throw new MockError(`Approval ${id} not found`);
    if (a.state !== "pending") throw new MockError(`This approval is already ${a.state}`);
    a.state = approve ? "approved" : "rejected";
    a.decidedAt = Math.floor(Date.now() / 1000);
    log(approve ? "approval.approved" : "approval.rejected", a.invoiceId, { approvalId: id });
    return a;
  },
};
