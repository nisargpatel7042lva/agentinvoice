import { InvoiceListSchema, InvoiceSchema } from "@agentinvoice/shared";
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
