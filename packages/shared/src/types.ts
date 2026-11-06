// Spec v2. See ../spec.md. Amounts are integer base units as decimal strings.

export const SPEC_VERSION = 2 as const;

export type Address = `0x${string}`;
export type Hash32 = `0x${string}`; // 0x + 64 hex
export type Amount = string; // decimal integer string, base units

export const STATUSES = ["Pending", "Open", "Funded", "Paid", "Late", "Defaulted"] as const;
export type Status = (typeof STATUSES)[number];

export interface Invoice {
  id: string;
  supplier: Address;
  buyerVault: Address;
  faceAmount: Amount;
  price: Amount;
  dueDate: number; // unix seconds
  status: Status;
  bond: Address | null; // null until a bond exists
  holder: Address | null; // set at funding
  evidenceHash: Hash32;
  description: string;
}

export interface Agent {
  ensName: string;
  vault: Address;
}

export interface EnsAgent {
  name: string;
  vault: Address; // addr record
  limit: Amount; // sponsor-set
  threshold: Amount; // sponsor-set
  paid: number; // publisher-set
  late: number; // publisher-set
  status: "active" | "paused" | "defaulted"; // publisher-set
  expiresAt: number; // unix seconds, from the registry
}

export type ApprovalState = "pending" | "approved" | "rejected" | "expired";

export interface Approval {
  id: string;
  invoiceId: string;
  state: ApprovalState;
  createdAt: number;
  decidedAt: number | null;
}

export interface ApprovalStart {
  approvalId: string;
  authorizationUrl: string;
}

export const SCORE_BANDS = ["A", "B", "C", "New"] as const;
export type ScoreBand = (typeof SCORE_BANDS)[number];

export interface BuyerScore {
  vault: Address;
  band: ScoreBand;
  onTimeRate: number; // 0 to 100
  paid: number;
  late: number;
  defaulted: number;
  openExposure: Amount;
  evidence: string[]; // transaction IDs / mirror hashes
  asOf: number; // unix seconds
}

export interface Score {
  agent: Address;
  value: number;
  updatedAt: number;
}


export interface AuditEvent {
  topicId: string; // HCS topic, e.g. 0.0.12345
  sequenceNumber: number;
  consensusTimestamp: string; // HCS "seconds.nanos"
  type: string; // e.g. invoice.created, invoice.funded
  invoiceId: string | null;
  data: Record<string, unknown>;
}

export interface ReviewResult {
  action: "approve" | "reject" | "escalate";
  reason: string;
}

export interface PayPolicy {
  dailyBudget: Amount;
  perCallCap: Amount;
  allowedPayTo: Address[];
  allowedHosts: string[];
}
