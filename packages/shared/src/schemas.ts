import { z } from "zod";
import {
  STATUSES,
  type Address,
  type Approval,
  type ApprovalStart,
  type AuditEvent,
  CIBIL_TIERS,
  type DualPartyCibilScore,
  type EnsAgent,
  type Hash32,
  type Invoice,
  type PartyCibilScore,
  type PayPolicy,
  type ReviewResult,
  SCORE_BANDS,
} from "./types";

const isHex = (len: number) => (v: unknown) =>
  typeof v === "string" && new RegExp(`^0x[0-9a-fA-F]{${len}}$`).test(v);

export const AddressSchema = z.custom<Address>(isHex(40), "expected 0x + 40 hex address");
export const Hash32Schema = z.custom<Hash32>(isHex(64), "expected 0x + 64 hex hash");
export const AmountSchema = z.string().regex(/^\d+$/, "expected decimal integer string");
export const StatusSchema = z.enum(STATUSES);

export const InvoiceSchema = z.object({
  id: z.string(),
  supplier: AddressSchema,
  buyerVault: AddressSchema,
  faceAmount: AmountSchema,
  price: AmountSchema,
  dueDate: z.number().int(),
  status: StatusSchema,
  bond: AddressSchema.nullable(),
  holder: AddressSchema.nullable(),
  evidenceHash: Hash32Schema,
  description: z.string(),
}) satisfies z.ZodType<Invoice>;
export const InvoiceListSchema = z.array(InvoiceSchema);

export const AuditEventSchema = z.object({
  topicId: z.string().regex(/^\d+\.\d+\.\d+$/),
  sequenceNumber: z.number().int().nonnegative(),
  consensusTimestamp: z.string().regex(/^\d+\.\d+$/),
  type: z.string(),
  invoiceId: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
}) satisfies z.ZodType<AuditEvent>;
export const AuditListSchema = z.array(AuditEventSchema);

export const ApprovalStartSchema = z.object({
  approvalId: z.string(),
  authorizationUrl: z.url(),
}) satisfies z.ZodType<ApprovalStart>;

export const ApprovalSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  state: z.enum(["pending", "approved", "rejected", "expired"]),
  createdAt: z.number().int(),
  decidedAt: z.number().int().nullable(),
}) satisfies z.ZodType<Approval>;

export const EnsAgentSchema = z.object({
  name: z.string(),
  vault: AddressSchema,
  limit: AmountSchema,
  threshold: AmountSchema,
  paid: z.number().int().nonnegative(),
  late: z.number().int().nonnegative(),
  status: z.enum(["active", "paused", "defaulted"]),
  expiresAt: z.number().int(),
}) satisfies z.ZodType<EnsAgent>;

export const ReviewResultSchema = z.object({
  action: z.enum(["approve", "reject", "escalate"]),
  reason: z.string(),
}) satisfies z.ZodType<ReviewResult>;

export const ScoreBandSchema = z.enum(SCORE_BANDS);

export const HealthSchema = z.object({ ok: z.boolean() }).loose();

export const PayPolicySchema = z.object({
  dailyBudget: AmountSchema,
  perCallCap: AmountSchema,
  allowedPayTo: z.array(AddressSchema),
  allowedHosts: z.array(z.string()),
}) satisfies z.ZodType<PayPolicy>;

export const BuyerScoreSchema = z.object({
  vault: AddressSchema,
  band: ScoreBandSchema,
  onTimeRate: z.number().min(0).max(100),
  paid: z.number().int().nonnegative(),
  late: z.number().int().nonnegative(),
  defaulted: z.number().int().nonnegative(),
  openExposure: AmountSchema,
  evidence: z.array(z.string()),
  asOf: z.number().int(),
});

export const CibilTierSchema = z.enum(CIBIL_TIERS);

export const PartyCibilScoreSchema = z.object({
  address: AddressSchema,
  role: z.enum(["supplier", "buyer"]),
  score: z.number().int().min(0).max(900),
  tier: CibilTierSchema,
  onTimeRate: z.number().min(0).max(100).optional(),
  acceptanceRate: z.number().min(0).max(100).optional(),
  totalInvoices: z.number().int().nonnegative(),
  settledInvoices: z.number().int().nonnegative(),
  defaultedInvoices: z.number().int().nonnegative(),
  disputeRate: z.number().min(0).max(100).optional(),
  evidenceHash: Hash32Schema.optional(),
  summary: z.string(),
  asOf: z.number().int(),
}) satisfies z.ZodType<PartyCibilScore>;

export const DualPartyCibilScoreSchema = z.object({
  invoiceId: z.string(),
  supplier: PartyCibilScoreSchema,
  buyer: PartyCibilScoreSchema,
  investmentGrade: z.boolean(),
  riskRecommendation: z.enum(["Strong Buy", "Moderate Buy", "High Risk / Caution", "Reject"]),
  recommendedDiscountBps: z.number().int().min(0).max(10000),
  asOf: z.number().int(),
}) satisfies z.ZodType<DualPartyCibilScore>;

