import { DualPartyCibilScoreSchema, PartyCibilScoreSchema } from "@agentinvoice/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

const SUPPLIER = "0x1111111111111111111111111111111111111111";
const VAULT = "0x2222222222222222222222222222222222222222";
const EVIDENCE = `0x${"ab".repeat(32)}`;

let app: ReturnType<typeof buildApp>;

function add(id: string, status: string, supplier = SUPPLIER, vault = VAULT) {
  app.db
    .prepare(
      `INSERT INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, evidence_hash, description, source, updated_at)
       VALUES (?, ?, ?, '100', '95', 2000000000, ?, ?, 'Demo description', 'chain', 0)`,
    )
    .run(id, supplier, vault, status, EVIDENCE);
}

beforeEach(() => {
  app = buildApp({ dbPath: ":memory:" });
  add("1", "Paid");
  add("2", "Paid");
  add("3", "Paid");
  add("4", "Open");
});

afterEach(() => app.close());

describe("CIBIL API routes", () => {
  it("GET /api/cibil/supplier/:address calculates and returns supplier CIBIL score", async () => {
    const res = await app.inject({ method: "GET", url: `/api/cibil/supplier/${SUPPLIER}` });
    expect(res.statusCode).toBe(200);

    const data = PartyCibilScoreSchema.parse(res.json());
    expect(data.address.toLowerCase()).toBe(SUPPLIER.toLowerCase());
    expect(data.role).toBe("supplier");
    expect(data.score).toBeGreaterThanOrEqual(650);
    expect(data.totalInvoices).toBe(4);
    expect(data.settledInvoices).toBe(3);
  });

  it("GET /api/cibil/buyer/:address calculates and returns buyer CIBIL score", async () => {
    const res = await app.inject({ method: "GET", url: `/api/cibil/buyer/${VAULT}` });
    expect(res.statusCode).toBe(200);

    const data = PartyCibilScoreSchema.parse(res.json());
    expect(data.address.toLowerCase()).toBe(VAULT.toLowerCase());
    expect(data.role).toBe("buyer");
    expect(data.score).toBeGreaterThanOrEqual(650);
    expect(data.onTimeRate).toBe(100);
  });

  it("GET /api/invoices/:id/cibil returns dual party score evaluation", async () => {
    const res = await app.inject({ method: "GET", url: "/api/invoices/4/cibil" });
    expect(res.statusCode).toBe(200);

    const data = DualPartyCibilScoreSchema.parse(res.json());
    expect(data.invoiceId).toBe("4");
    expect(data.supplier.address.toLowerCase()).toBe(SUPPLIER.toLowerCase());
    expect(data.buyer.address.toLowerCase()).toBe(VAULT.toLowerCase());
    expect(data.investmentGrade).toBe(true);
    expect(["Strong Buy", "Moderate Buy"]).toContain(data.riskRecommendation);
  });

  it("returns 404 for non-existent invoice on dual cibil route", async () => {
    const res = await app.inject({ method: "GET", url: "/api/invoices/999/cibil" });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for malformed address", async () => {
    const res = await app.inject({ method: "GET", url: "/api/cibil/supplier/invalid-address" });
    expect(res.statusCode).toBe(400);
  });
});

