import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../db.js";
import { createBondService } from "./service.js";

const BOND = "0x00000000000000000000000000000000000000b1" as const;
const HOLDER = "0x00000000000000000000000000000000000000a1";
let db: Database.Database;
let calls: string[];
let failIssue: boolean;
const ats = {
  grantKyc: async (_b: string, h: string) => (calls.push(`kyc ${h}`), "0xk" as const),
  issue: async (_b: string, _h: string, u: bigint, d?: string) => {
    if (failIssue) throw new Error("rpc down");
    calls.push(`issue ${u} ${d}`);
    return "0xi" as const;
  },
  controllerRedeem: async (_b: string, _h: string, u: bigint) => (calls.push(`redeem ${u}`), "0xr" as const),
  freeze: async (_b: string, _h: string, f: boolean) => (calls.push(`freeze ${f}`), "0xf" as const),
};
const svc = () => createBondService({ db, ats: ats as never, bond: BOND });
const setStatus = (s: string) => db.prepare("UPDATE invoices SET status = ? WHERE id = '7'").run(s);

beforeEach(() => {
  db = new Database(":memory:");
  migrate(db);
  db.prepare("INSERT INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, holder, evidence_hash, source, updated_at) VALUES ('7','0xs','0xv','1000','900',1,'Funded',?, '0xe','chain',1)").run(HOLDER);
  calls = [];
  failIssue = false;
});

describe("bond service", () => {
  it("issues once for a funded invoice, with the invoice id as data, and records the bond", async () => {
    await svc().reconcile();
    await svc().reconcile();
    expect(calls).toEqual([`kyc ${HOLDER}`, `issue 1000 0x${"0".repeat(63)}7`]);
    expect((db.prepare("SELECT bond FROM invoices WHERE id='7'").get() as { bond: string }).bond).toBe(BOND);
  });
  it("retries after a failed issue without double issuing", async () => {
    failIssue = true;
    await svc().reconcile();
    expect(db.prepare("SELECT COUNT(*) c FROM bond_issuances").get()).toEqual({ c: 0 });
    failIssue = false;
    await svc().reconcile();
    expect(calls.filter((c) => c.startsWith("issue"))).toHaveLength(1);
  });
  it("redeems at Paid and freezes at Defaulted, once", async () => {
    await svc().reconcile();
    setStatus("Paid");
    await svc().reconcile();
    await svc().reconcile();
    expect(calls.filter((c) => c.startsWith("redeem"))).toEqual(["redeem 1000"]);
    expect((db.prepare("SELECT state FROM bond_issuances").get() as { state: string }).state).toBe("redeemed");
  });
  it("freezes the holder when the invoice defaults", async () => {
    await svc().reconcile();
    setStatus("Defaulted");
    await svc().reconcile();
    expect(calls).toContain("freeze true");
  });
});
