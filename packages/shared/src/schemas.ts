import { z } from "zod";
import {
  STATUSES,
  type Address,
  type Approval,
  type ApprovalStart,
  type AuditEvent,
  type BuyerScore,
  type CreditFactor,
  type CreditReport,
  type EnsAgent,
  type Hash32,
  type Invoice,
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

export const CreditFactorSchema = z.object({
  key: z.enum(["payment", "defaults", "exposure", "history", "volume"]),
  label: z.string(),
  weight: z.number(),
  value: z.number().min(0).max(1),
  points: z.number().int(),
  detail: z.string(),
  evidence: z.array(z.string()),
}) satisfies z.ZodType<CreditFactor>;

export const CreditReportSchema = z.object({
  vault: AddressSchema,
  score: z.number().int().min(300).max(900).nullable(),
  band: ScoreBandSchema,
  model: z.string(),
  factors: z.array(CreditFactorSchema),
  summary: z.string(),
  asOf: z.number().int(),
  counts: z.object({
    onTime: z.number().int().nonnegative(),
    paidLate: z.number().int().nonnegative(),
    late: z.number().int().nonnegative(),
    defaulted: z.number().int().nonnegative(),
    settled: z.number().int().nonnegative(),
  }),
  openExposure: AmountSchema,
}) satisfies z.ZodType<CreditReport>;

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
  creditScore: z.number().int().min(300).max(900).nullable().optional(),
  credit: CreditReportSchema.optional(),
}) satisfies z.ZodType<BuyerScore>;

/** Read-only SaucerSwap status for the treasury UI (no secrets). */
export const SaucerSwapStatusSchema = z.object({
  network: z.literal("testnet"),
  usdc: z.object({
    tokenId: z.string(),
    symbol: z.string(),
    decimals: z.number().int(),
    label: z.string(),
    caveat: z.string(),
    circleOfficialTokenId: z.string(),
  }),
  contracts: z.object({
    whbarTokenId: z.string(),
    quoterV2: z.string(),
    swapRouter: z.string(),
  }),
  operator: z
    .object({
      accountId: z.string(),
      hbarTinybar: AmountSchema,
      usdcBaseUnits: AmountSchema,
      usdcAssociated: z.boolean(),
    })
    .optional(),
  dryRun: z.boolean(),
});

export const SaucerSwapQuoteSchema = z.object({
  ok: z.literal(true),
  amountInTinybar: AmountSchema,
  amountOut: AmountSchema,
  amountOutMinimum: AmountSchema,
  fee: z.number().int(),
  tokenOut: z.string(),
  quotedAt: z.number().int(),
  expiresAt: z.number().int(),
  usdcLabel: z.string(),
  caveat: z.string(),
});


/** GET /api/agents: the vault -> ENS name pairs buyers registered on the website. */
export const AgentListSchema = z.object({ agents: z.array(z.object({ vault: AddressSchema, name: z.string(), owner: AddressSchema })) });

/** GET /api/invoices/:id/approval: the World-approved, verifier-signed payment approval for BuyerVault.payInvoice. */
export const InvoiceApprovalSchema = z.object({
  approvalId: z.string(),
  approval: z.custom<`0x${string}`>((v) => typeof v === "string" && /^0x[0-9a-fA-F]*$/.test(v), "expected hex bytes"),
  expiry: z.number(),
  verifier: AddressSchema,
});
