import { InvoiceListSchema, InvoiceSchema } from "@invoiceagent/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

const SUPPLIER = "0x1111111111111111111111111111111111111111";
const VAULT_A = "0x2222222222222222222222222222222222222222";
const VAULT_B = "0x3333333333333333333333333333333333333333";
const EVIDENCE = `0x${"ab".repeat(32)}`;

let app: ReturnType<typeof buildApp>;

function add(id: string, status: string, vault = VAULT_A, source = "chain", description = "Printing job") {
  app.db
    .prepare(
      `INSERT INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, evidence_hash, description, source, updated_at)
       VALUES (?, ?, ?, '100', '95', 2000000000, ?, ?, ?, ?, 0)`,
    )
    .run(id, SUPPLIER, vault, status, EVIDENCE, description, source);
}

beforeEach(() => {
  app = buildApp({ dbPath: ":memory:" });
  add("1", "Open");
  add("2", "Funded", VAULT_B);
  add("10", "Paid", VAULT_A, "seed", "DEMO: sample invoice");
});
afterEach(() => app.close());

describe("GET /api/invoices", () => {
  it("returns schema-valid invoices, newest id first, including labelled seed rows", async () => {
    const res = await app.inject({ method: "GET", url: "/api/invoices" });
    const body = InvoiceListSchema.parse(res.json());

    expect(res.statusCode).toBe(200);
    expect(body.map((i) => i.id)).toEqual(["10", "2", "1"]);
    expect(body[0]?.description).toBe("DEMO: sample invoice");
    expect(body[1]).toMatchObject({ status: "Funded", bond: null, holder: null, dueDate: 2000000000 });
  });

  it("filters by status, supplier and buyer vault", async () => {
    const byStatus = await app.inject({ method: "GET", url: "/api/invoices?status=Funded" });
    expect(InvoiceListSchema.parse(byStatus.json()).map((i) => i.id)).toEqual(["2"]);

    const byVault = await app.inject({ method: "GET", url: `/api/invoices?buyer=${VAULT_A}` });
    expect(InvoiceListSchema.parse(byVault.json()).map((i) => i.id)).toEqual(["10", "1"]);

    const bySupplier = await app.inject({ method: "GET", url: `/api/invoices?supplier=${SUPPLIER.toUpperCase().replace("0X", "0x")}` });
    expect(InvoiceListSchema.parse(bySupplier.json())).toHaveLength(3);
  });

  it("rejects a bad filter with 400", async () => {
    expect((await app.inject({ method: "GET", url: "/api/invoices?status=Bogus" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/invoices?buyer=nope" })).statusCode).toBe(400);
  });
});

describe("GET /api/invoices/:id", () => {
  it("returns one schema-valid invoice", async () => {
    const res = await app.inject({ method: "GET", url: "/api/invoices/1" });
    expect(res.statusCode).toBe(200);
    expect(InvoiceSchema.parse(res.json())).toMatchObject({ id: "1", status: "Open", supplier: SUPPLIER });
  });

  it("returns 404 for an unknown id and 400 for a malformed id", async () => {
    expect((await app.inject({ method: "GET", url: "/api/invoices/999" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/invoices/abc" })).statusCode).toBe(400);
  });
});

describe("POST /api/invoices", () => {
  const BODY = {
    buyerVault: VAULT_A,
    faceAmount: "1000000",
    price: "950000",
    dueDate: 4_000_000_000,
    description: "Printing job #42",
    evidenceHash: `0x${"cd".repeat(32)}`,
  };

  interface Call {
    buyerVault: string;
    faceAmount: bigint;
    price: bigint;
    dueDate: bigint;
    evidenceHash: string;
  }
  let calls: Call[];
  let audits: { type: string; invoiceId: string | null }[];
  let nextId: number;
  let gate: Promise<void> | undefined;
  let failWith: Error | undefined;

  function issuerApp(limits?: Parameters<typeof buildApp>[0]["limits"]) {
    const issuer = {
      createInvoice: async (args: Call & { evidenceHash: `0x${string}`; buyerVault: `0x${string}` }) => {
        calls.push(args);
        if (gate) await gate;
        if (failWith) throw failWith;
        const id = String(nextId++);
        return {
          id,
          txHash: `0x${"11".repeat(32)}` as `0x${string}`,
          invoice: {
            supplier: SUPPLIER as `0x${string}`,
            buyerVault: args.buyerVault,
            faceAmount: args.faceAmount,
            price: args.price,
            dueDate: args.dueDate,
            status: 0,
            bond: "0x0000000000000000000000000000000000000000" as `0x${string}`,
            holder: "0x0000000000000000000000000000000000000000" as `0x${string}`,
            evidenceHash: args.evidenceHash,
          },
        };
      },
    };
    return buildApp({ dbPath: ":memory:", world: null, issuer, limits, onAudit: (e) => void audits.push(e) });
  }

  beforeEach(async () => {
    await app.close();
    calls = [];
    audits = [];
    nextId = 5;
    gate = undefined;
    failWith = undefined;
    app = issuerApp();
  });

  const post = (body: unknown) => app.inject({ method: "POST", url: "/api/invoices", payload: body as object });

  it("creates the invoice through the issuer and returns it as a schema-valid Pending invoice with its description", async () => {
    const res = await post(BODY);
    expect(res.statusCode).toBe(201);
    const inv = InvoiceSchema.parse(res.json());

    expect(inv).toMatchObject({ id: "5", status: "Pending", buyerVault: VAULT_A, faceAmount: "1000000", price: "950000", dueDate: 4_000_000_000, description: "Printing job #42", bond: null, holder: null });
    expect(calls).toEqual([{ buyerVault: VAULT_A, faceAmount: 1000000n, price: 950000n, dueDate: 4000000000n, evidenceHash: BODY.evidenceHash }]);

    const again = await app.inject({ method: "GET", url: "/api/invoices/5" });
    expect(InvoiceSchema.parse(again.json()).description).toBe("Printing job #42");
    expect(audits).toEqual([{ type: "invoice.created", invoiceId: "5", data: { status: "Pending" } }]);
  });

  it.each([
    ["a missing field", { ...BODY, description: undefined }],
    ["an empty description", { ...BODY, description: "   " }],
    ["a description over 500 characters", { ...BODY, description: "x".repeat(501) }],
    ["a bad vault address", { ...BODY, buyerVault: "0x123" }],
    ["a zero face amount", { ...BODY, faceAmount: "0", price: "0" }],
    ["a price above the face amount", { ...BODY, price: "1000001" }],
    ["a non-integer amount", { ...BODY, faceAmount: "1.5" }],
    ["an amount above uint256", { ...BODY, faceAmount: (2n ** 256n).toString() }],
    ["a due date in the past", { ...BODY, dueDate: 1000 }],
    ["a bad evidence hash", { ...BODY, evidenceHash: "0xabc" }],
  ])("rejects %s with 400 and never calls the chain", async (_name, body) => {
    const res = await post(body);
    expect(res.statusCode).toBe(400);
    expect(calls).toEqual([]);
  });

  it("refuses a second invoice with the same evidence hash and points at the first", async () => {
    await post(BODY);
    const res = await post({ ...BODY, description: "different words" });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "duplicate_evidence", invoiceId: "5" });
    expect(calls).toHaveLength(1);
  });

  it("lets only one of two simultaneous identical requests reach the chain", async () => {
    let release!: () => void;
    gate = new Promise<void>((r) => (release = r));
    const first = post(BODY);
    await new Promise((r) => setTimeout(r, 20));
    const second = await post(BODY);
    release();

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: "in_progress" });
    expect((await first).statusCode).toBe(201);
    expect(calls).toHaveLength(1);
  });

  it("answers 502 and stores nothing when the chain call fails, so the same request can be retried", async () => {
    failWith = new Error("rpc down");
    const res = await post(BODY);
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: "chain_error" });
    expect((app.db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE id = '5'").get() as { n: number }).n).toBe(0);

    failWith = undefined;
    expect((await post(BODY)).statusCode).toBe(201);
  });

  it("answers 503 when no issuer wallet is configured", async () => {
    await app.close();
    app = buildApp({ dbPath: ":memory:", world: null });
    expect((await post(BODY)).statusCode).toBe(503);
  });

  it("is rate limited per client", async () => {
    await app.close();
    app = issuerApp({ invoiceCreatePerMinute: 2 });
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await post({ ...BODY, evidenceHash: `0x${i.toString(16).padStart(64, "0")}` })).statusCode);
    expect(codes).toEqual([201, 201, 429]);
  });
});
