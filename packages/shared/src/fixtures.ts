import {
  STATUSES,
  type Address,
  type Approval,
  type ApprovalStart,
  type AuditEvent,
  type EnsAgent,
  type Invoice,
  type PayPolicy,
  type ReviewResult,
  type ScoreResult,
  type Status,
} from "./types";

const SUPPLIER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";
const HOLDER: Address = "0x3333333333333333333333333333333333333333";
const BOND: Address = "0x4444444444444444444444444444444444444444";
const BASE_DUE = 1_794_000_000;

const funded = (s: Status) => s === "Funded" || s === "Paid" || s === "Late" || s === "Defaulted";

/** One invoice per status, in status order (Pending first). */
export const invoiceFixtures: Invoice[] = STATUSES.map((status, i) => ({
  id: String(i + 1),
  supplier: SUPPLIER,
  buyerVault: VAULT,
  faceAmount: "1000000000",
  price: "950000000",
  dueDate: BASE_DUE + i * 86_400,
  status,
  bond: funded(status) ? BOND : null,
  holder: funded(status) ? HOLDER : null,
  evidenceHash: `0x${String(i + 1).padStart(64, "0")}`,
  description: `Sample invoice #${i + 1} (${status})`,
}));

/** Newest first, as GET /api/audit returns them. */
export const auditFixtures: AuditEvent[] = [
  { topicId: "0.0.5005", sequenceNumber: 3, consensusTimestamp: "1793900300.000000003", type: "invoice.funded", invoiceId: "3", data: { holder: HOLDER } },
  { topicId: "0.0.5005", sequenceNumber: 2, consensusTimestamp: "1793900200.000000002", type: "invoice.accepted", invoiceId: "2", data: {} },
  { topicId: "0.0.5005", sequenceNumber: 1, consensusTimestamp: "1793900100.000000001", type: "invoice.created", invoiceId: "1", data: { supplier: SUPPLIER } },
];

export const approvalStartFixture: ApprovalStart = {
  approvalId: "appr_1",
  authorizationUrl: "https://example.com/world/authorize?approval=appr_1",
};

export const approvalFixture: Approval = {
  id: "appr_1",
  invoiceId: "3",
  state: "pending",
  createdAt: 1_793_900_400,
  decidedAt: null,
};

export const ensAgentFixture: EnsAgent = {
  name: "buyer-agent.eth",
  vault: VAULT,
  limit: "5000000000",
  threshold: "1000000000",
  paid: 1,
  late: 1,
  status: "active",
  expiresAt: 1_825_000_000,
};

export const reviewFixture: ReviewResult = { action: "approve", reason: "Supplier allowed and within limit" };

export const payPolicyFixture: PayPolicy = {
  dailyBudget: "5000000000",
  perCallCap: "1000000000",
  allowedPayTo: [VAULT],
  allowedHosts: ["localhost", "testnet.hashio.io"],
};

/** Three scored vaults (bands A, B, C) plus one New vault. VAULT itself is band A. */
export const scoreFixtures: ScoreResult[] = [
  { vault: VAULT, band: "A", value: 86, paid: 12, late: 0, updatedAt: 1_793_900_000 },
  { vault: "0x5555555555555555555555555555555555555555", band: "B", value: 68, paid: 7, late: 2, updatedAt: 1_793_900_000 },
  { vault: "0x6666666666666666666666666666666666666666", band: "C", value: 41, paid: 3, late: 4, updatedAt: 1_793_900_000 },
  { vault: "0x7777777777777777777777777777777777777777", band: "New", value: null, paid: 0, late: 0, updatedAt: 1_793_900_000 },
];
