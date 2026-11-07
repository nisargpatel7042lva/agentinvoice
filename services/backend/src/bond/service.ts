import type Database from "better-sqlite3";
import { numberToHex, type Address, type Hex } from "viem";
import type { AtsIssuer } from "./ats.js";

// Hedera Tokenize (route T1b): the market contract pays the stored holder, and this service mirrors that fact in an ATS bond.
// Funded -> KYC the holder and issue units equal to the face amount (1 unit = 1 tinybar), with the invoice id in the data field.
// Paid -> redeem them. Defaulted -> freeze the holder. Everything is derived from the invoices table, so it is safe to re-run.
// The token is a trusted mirror, not the source of truth for who is paid: the market contract is.

interface InvoiceRow {
  id: string;
  status: string;
  holder: string | null;
  face_amount: string;
}
interface IssuanceRow {
  state: "issuing" | "issued" | "redeemed" | "frozen";
}

export interface BondService {
  reconcile(): Promise<void>;
}

export function createBondService(opts: { db: Database.Database; ats: Pick<AtsIssuer, "grantKyc" | "issue" | "controllerRedeem" | "freeze"> & Partial<Pick<AtsIssuer, "isKycGranted" | "balanceOf">>; bond: Address; now?: () => number; onError?: (err: unknown, invoiceId: string) => void }): BondService {
  const { db, ats, bond } = opts;
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  let running = false;

  const get = db.prepare("SELECT state FROM bond_issuances WHERE invoice_id = ?");
  const begin = db.prepare("INSERT OR IGNORE INTO bond_issuances (invoice_id, bond, holder, units, state, updated_at) VALUES (?,?,?,?, 'issuing', ?)");
  const drop = db.prepare("DELETE FROM bond_issuances WHERE invoice_id = ? AND state = 'issuing'");
  const issued = db.prepare("UPDATE bond_issuances SET state = 'issued', issue_tx = ?, updated_at = ? WHERE invoice_id = ?");
  const closed = db.prepare("UPDATE bond_issuances SET state = ?, close_tx = ?, updated_at = ? WHERE invoice_id = ?");
  const setBond = db.prepare("UPDATE invoices SET bond = ? WHERE id = ? AND source = 'chain'");

  // A row still at "issuing" when a pass starts can only come from a crash or restart in the middle of an issuance (a live pass always
  // resolves its row). Without this it would block that invoice for good. Settle it against the chain, never by guessing: if the holder's
  // balance already covers this issuance on top of what they hold from other invoices, it landed; otherwise nothing was issued, so retry.
  async function recoverInterrupted() {
    if (!ats.balanceOf) return;
    const stale = db.prepare("SELECT invoice_id, holder, units FROM bond_issuances WHERE state = 'issuing'").all() as { invoice_id: string; holder: string; units: string }[];
    for (const r of stale) {
      const held = db.prepare("SELECT units FROM bond_issuances WHERE holder = ? AND state IN ('issued','frozen') AND invoice_id <> ?").all(r.holder, r.invoice_id) as { units: string }[];
      const expected = held.reduce((sum, h) => sum + BigInt(h.units), 0n) + BigInt(r.units);
      const balance = await ats.balanceOf(bond, r.holder as Address);
      if (balance >= expected) {
        issued.run(null, now(), r.invoice_id); // it landed; the tx hash was lost with the crash
        setBond.run(bond, r.invoice_id);
      } else {
        drop.run(r.invoice_id);
      }
    }
  }

  async function one(inv: InvoiceRow) {
    const holder = inv.holder as Address;
    const row = get.get(inv.id) as IssuanceRow | undefined;
    if ((inv.status === "Funded" || inv.status === "Late") && !row) {
      if (begin.run(inv.id, bond, holder, inv.face_amount, now()).changes === 0) return;
      try {
        // A holder keeps their KYC across invoices, and ATS refuses a second grant, so only grant it the first time.
        if (!(ats.isKycGranted && (await ats.isKycGranted(bond, holder)))) await ats.grantKyc(bond, holder);
        const tx = await ats.issue(bond, holder, BigInt(inv.face_amount), numberToHex(BigInt(inv.id), { size: 32 }) as Hex);
        issued.run(tx, now(), inv.id);
        setBond.run(bond, inv.id);
      } catch (e) {
        drop.run(inv.id); // nothing was issued (or we cannot tell); the next pass tries again
        throw e;
      }
    } else if (inv.status === "Paid" && row?.state === "issued") {
      const tx = await ats.controllerRedeem(bond, holder, BigInt(inv.face_amount));
      closed.run("redeemed", tx, now(), inv.id);
    } else if (inv.status === "Defaulted" && row?.state === "issued") {
      const tx = await ats.freeze(bond, holder, true);
      closed.run("frozen", tx, now(), inv.id);
    }
  }

  return {
    async reconcile() {
      if (running) return;
      running = true;
      try {
        await recoverInterrupted().catch((e) => opts.onError?.(e, "recover"));
        const rows = db.prepare("SELECT id, status, holder, face_amount FROM invoices WHERE source = 'chain' AND holder IS NOT NULL AND status IN ('Funded','Late','Paid','Defaulted') ORDER BY CAST(id AS INTEGER)").all() as InvoiceRow[];
        for (const inv of rows) {
          try {
            await one(inv);
          } catch (e) {
            opts.onError?.(e, inv.id);
          }
        }
      } finally {
        running = false;
      }
    },
  };
}
