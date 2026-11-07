import type { z } from "zod";
import {
  ApprovalSchema,
  ApprovalStartSchema,
  AgentListSchema,
  InvoiceApprovalSchema,
  AuditListSchema,
  HealthSchema,
  InvoiceListSchema,
  InvoiceSchema,
  BuyerScoreSchema,
  SaucerSwapQuoteSchema,
  SaucerSwapStatusSchema,
} from "./schemas";
import {
  approvalFixture,
  approvalStartFixture,
  auditFixtures,
  invoiceFixtures,
  scoreFixtures,
} from "./fixtures";
import type { Address, Hash32, Status } from "./types";

export interface CreateInvoiceBody {
  buyerVault: Address;
  faceAmount: string;
  price: string;
  dueDate: number;
  description: string;
  evidenceHash: Hash32;
}

export interface ApiClientOptions {
  baseUrl?: string;
  /** Return fixtures instead of calling the backend (NEXT_PUBLIC_MOCK=1). */
  mock?: boolean;
  fetch?: typeof fetch;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Typed client for the backend API in spec v2 §3. Every response is zod-validated. */
export function createApiClient(opts: ApiClientOptions = {}) {
  const f = opts.fetch ?? fetch;
  const base = (opts.baseUrl ?? "").replace(/\/$/, "");

  async function call<S extends z.ZodType>(schema: S, path: string, init?: RequestInit): Promise<z.infer<S>> {
    const res = await f(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
    if (!res.ok) throw new ApiError(res.status, `${init?.method ?? "GET"} ${path} -> ${res.status}`);
    return schema.parse(await res.json());
  }

  const mock = opts.mock === true;
  const notFound = (what: string) => Promise.reject(new ApiError(404, `${what} not found (mock)`));

  return {
    mock,
    health: () => (mock ? Promise.resolve({ ok: true }) : call(HealthSchema, "/health")),

    listInvoices: (status?: Status) =>
      mock
        ? Promise.resolve(invoiceFixtures.filter((i) => !status || i.status === status))
        : call(InvoiceListSchema, `/api/invoices${status ? `?status=${status}` : ""}`),

    getInvoice: (id: string) => {
      if (!mock) return call(InvoiceSchema, `/api/invoices/${encodeURIComponent(id)}`);
      const inv = invoiceFixtures.find((i) => i.id === id);
      return inv ? Promise.resolve(inv) : notFound(`invoice ${id}`);
    },

    createInvoice: (body: CreateInvoiceBody) =>
      mock
        ? Promise.resolve({ ...invoiceFixtures[0], ...body, id: "99", status: "Pending" as const })
        : call(InvoiceSchema, "/api/invoices", { method: "POST", body: JSON.stringify(body) }),

    /** Vault -> ENS name pairs buyers registered on the website. Read-only, public. */
    listAgents: () =>
      mock
        ? Promise.resolve({ agents: [] as { vault: Address; name: string; owner: Address }[] })
        : call(AgentListSchema, "/api/agents"),

    /** The signed approval for a Funded invoice above the vault's threshold, or null while no human has approved it yet. */
    getInvoiceApproval: async (id: string) => {
      if (mock) return null;
      try {
        return await call(InvoiceApprovalSchema, `/api/invoices/${encodeURIComponent(id)}/approval`);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 503)) return null;
        throw e;
      }
    },

    listAudit: () => (mock ? Promise.resolve(auditFixtures) : call(AuditListSchema, "/api/audit")),

    startApproval: (invoiceId: string) =>
      mock
        ? Promise.resolve(approvalStartFixture)
        : call(ApprovalStartSchema, "/api/approvals", { method: "POST", body: JSON.stringify({ invoiceId }) }),

    getApproval: (id: string) => {
      if (!mock) return call(ApprovalSchema, `/api/approvals/${encodeURIComponent(id)}`);
      return id === approvalFixture.id ? Promise.resolve(approvalFixture) : notFound(`approval ${id}`);
    },

    /** Mock only. Real scores are paid: agents call the score API through payAndGet. */
    getScoreMock: (vault: string) => {
      const s = scoreFixtures.find((x) => x.vault.toLowerCase() === vault.toLowerCase());
      return s ? Promise.resolve(BuyerScoreSchema.parse(s)) : notFound(`score ${vault}`);
    },

    /** Read-only SaucerSwap treasury status (503 when backend feature is off). */
    getSaucerSwapStatus: () =>
      mock
        ? Promise.resolve(
            SaucerSwapStatusSchema.parse({
              network: "testnet",
              usdc: {
                tokenId: "0.0.5449",
                symbol: "USDC",
                decimals: 6,
                label: "SaucerSwap testnet USDC",
                caveat:
                  "SaucerSwap testnet USDC (0.0.5449) is not Circle's official testnet USDC (0.0.429274). Circle's token has no SaucerSwap testnet pool.",
                circleOfficialTokenId: "0.0.429274",
              },
              contracts: {
                whbarTokenId: "0.0.15058",
                quoterV2: "0.0.1390002",
                swapRouter: "0.0.1414040",
              },
              dryRun: true,
            }),
          )
        : call(SaucerSwapStatusSchema, "/api/saucerswap/status"),

    /** Read-only HBAR→USDC quote (amountInTinybar defaults to 1 HBAR on the server). */
    getSaucerSwapQuote: (amountInTinybar?: string) => {
      const q = amountInTinybar ? `?amountInTinybar=${encodeURIComponent(amountInTinybar)}` : "";
      if (mock) {
        return Promise.resolve(
          SaucerSwapQuoteSchema.parse({
            ok: true,
            amountInTinybar: amountInTinybar ?? "100000000",
            amountOut: "2425296",
            amountOutMinimum: "2401043",
            fee: 3000,
            tokenOut: "0.0.5449",
            quotedAt: Math.floor(Date.now() / 1000),
            expiresAt: Math.floor(Date.now() / 1000) + 30,
            usdcLabel: "SaucerSwap testnet USDC",
            caveat:
              "SaucerSwap testnet USDC (0.0.5449) is not Circle's official testnet USDC (0.0.429274). Circle's token has no SaucerSwap testnet pool.",
          }),
        );
      }
      return call(SaucerSwapQuoteSchema, `/api/saucerswap/quote${q}`);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
