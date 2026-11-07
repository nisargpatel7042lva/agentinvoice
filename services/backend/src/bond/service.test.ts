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
  it("skips the KYC grant when the holder already has it from an earlier invoice, and still issues", async () => {
    const withKyc = createBondService({ db, ats: { ...ats, isKycGranted: async () => true } as never, bond: BOND });
    await withKyc.reconcile();
    expect(calls).toEqual([`issue 1000 0x${"0".repeat(63)}7`]);
  });
  it("grants KYC first when the holder has none", async () => {
    const noKyc = createBondService({ db, ats: { ...ats, isKycGranted: async () => false } as never, bond: BOND });
    await noKyc.reconcile();
    expect(calls[0]).toBe(`kyc ${HOLDER}`);
  });
  it("recovers a row left at issuing by a restart: retries when nothing landed, marks issued when it did", async () => {
    // Nothing landed: the holder holds 0, so the interrupted issuance is retried.
    db.prepare("INSERT INTO bond_issuances (invoice_id, bond, holder, units, state, updated_at) VALUES ('7', ?, ?, '1000', 'issuing', 1)").run(BOND, HOLDER);
    const empty = createBondService({ db, ats: { ...ats, balanceOf: async () => 0n } as never, bond: BOND });
    await empty.reconcile();
    expect(calls).toEqual([`kyc ${HOLDER}`, `issue 1000 0x${"0".repeat(63)}7`]);
    expect((db.prepare("SELECT state FROM bond_issuances WHERE invoice_id='7'").get() as { state: string }).state).toBe("issued");

    // It had landed: the balance already covers it, so it is marked issued and nothing is issued twice.
    calls = [];
    db.prepare("DELETE FROM bond_issuances").run();
    db.prepare("UPDATE invoices SET bond = NULL").run();
    db.prepare("INSERT INTO bond_issuances (invoice_id, bond, holder, units, state, updated_at) VALUES ('7', ?, ?, '1000', 'issuing', 1)").run(BOND, HOLDER);
    const landed = createBondService({ db, ats: { ...ats, balanceOf: async () => 1000n } as never, bond: BOND });
    await landed.reconcile();
    expect(calls).toEqual([]);
    expect((db.prepare("SELECT state FROM bond_issuances WHERE invoice_id='7'").get() as { state: string }).state).toBe("issued");
    expect((db.prepare("SELECT bond FROM invoices WHERE id='7'").get() as { bond: string }).bond).toBe(BOND);
  });
  it("counts units the holder already has from other invoices before deciding an issuance landed", async () => {
    db.prepare("INSERT INTO invoices (id, supplier, buyer_vault, face_amount, price, due_date, status, holder, evidence_hash, source, updated_at) VALUES ('8','0xs','0xv','500','450',1,'Funded',?, '0xe2','chain',1)").run(HOLDER);
    db.prepare("INSERT INTO bond_issuances (invoice_id, bond, holder, units, state, updated_at) VALUES ('8', ?, ?, '500', 'issued', 1)").run(BOND, HOLDER);
    db.prepare("INSERT INTO bond_issuances (invoice_id, bond, holder, units, state, updated_at) VALUES ('7', ?, ?, '1000', 'issuing', 1)").run(BOND, HOLDER);
    // The holder has only the 500 from invoice 8, so invoice 7's 1000 did not land: retry it.
    const svcOnly = createBondService({ db, ats: { ...ats, balanceOf: async () => 500n } as never, bond: BOND });
    await svcOnly.reconcile();
    expect(calls).toContain(`issue 1000 0x${"0".repeat(63)}7`);
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
