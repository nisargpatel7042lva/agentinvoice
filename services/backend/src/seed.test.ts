import { InvoiceListSchema, STATUSES } from "@invoiceagent/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { removeSeed, seedDemoInvoices } from "./seed.js";

describe("seedDemoInvoices", () => {
  it("inserts one clearly labelled DEMO row per status, tagged source=seed", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    expect(seedDemoInvoices(app.db)).toBe(6);

    const rows = app.db.prepare("SELECT status, source, description FROM invoices ORDER BY id").all() as { status: string; source: string; description: string }[];
    expect(rows.map((r) => r.status)).toEqual([...STATUSES]);
    expect(rows.every((r) => r.source === "seed" && r.description.startsWith("DEMO"))).toBe(true);

    const res = await app.inject({ method: "GET", url: "/api/invoices" });
    expect(InvoiceListSchema.safeParse(res.json()).success).toBe(true);
    await app.close();
  });

  it("is idempotent and removeSeed never touches chain rows", async () => {
    const app = buildApp({ dbPath: ":memory:" });
    app.db
      .prepare(
        `INSERT INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, evidence_hash, source, updated_at)
         VALUES ('1', '0xa', '0xb', '100', '95', 1, 'Open', '0xe', 'chain', 0)`,
      )
      .run();
    seedDemoInvoices(app.db);
    expect(seedDemoInvoices(app.db)).toBe(0);
    expect((app.db.prepare("SELECT COUNT(*) AS n FROM invoices").get() as { n: number }).n).toBe(7);

    expect(removeSeed(app.db)).toBe(6);
    expect(app.db.prepare("SELECT id, source FROM invoices").all()).toEqual([{ id: "1", source: "chain" }]);
    await app.close();
  });
});
