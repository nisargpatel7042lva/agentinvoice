"use server";
// Every button in the app calls one of these. This file is the contract between the UI and the rest of the team:
// mock mode changes the in-memory demo store; real mode is where each owner wires their piece.
// See docs/notes/frontend-actions.md.
import { revalidatePath } from "next/cache";
import { ensAgentFixture, parseUnits, type Address, type Hash32 } from "@agentinvoice/shared";
import { isMock } from "@/lib/env";
import { MockError, mockStore } from "@/lib/mockStore";

export type ActionResult<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; message: string };


const notWired = (what: string, owner: string): ActionResult<never> => ({
  ok: false,
  message: `${what} is not connected to the real system yet (owner: ${owner}). Run with NEXT_PUBLIC_MOCK=1 to click through it.`,
});

async function run<T>(fn: () => T | Promise<T>, success: string | ((v: T) => string)): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, message: typeof success === "string" ? success : success(data), data };
  } catch (e) {
    if (e instanceof MockError) return { ok: false, message: e.message };
    throw e;
  }
}

// ---- investor ----
/** Demo-data funding: records the connected wallet as holder; no HBAR moves. Real mode funds on-chain from the browser (FundButton). */
export async function fundInvoice(id: string, holder: Address): Promise<ActionResult> {
  if (!isMock) return { ok: false, message: "Real funding is sent from your wallet, not the server." };
  if (!/^0x[0-9a-fA-F]{40}$/.test(holder)) return { ok: false, message: "Connect a wallet first." };
  return run(() => void mockStore.fund(id, holder), `Invoice #${id} funded (demo data, no HBAR moved). Your wallet is now the holder.`);
}

// ---- supplier ----
export interface CreateInvoiceInput {
  buyerName: string;
  face: string; // HBAR, e.g. "10.5"
  price: string;
  dueDate: string; // yyyy-mm-dd
  description: string;
  evidenceHash: Hash32;
}

/** Real: POST /api/invoices (owner: Sidd's backend issues it on-chain). */
export async function createInvoice(input: CreateInvoiceInput): Promise<ActionResult<{ id: string }>> {
  if (!isMock) return notWired("Creating invoices", "Sidd (POST /api/invoices)");
  return run(() => {
    if (input.buyerName.trim() !== ensAgentFixture.name) throw new MockError(`Unknown buyer "${input.buyerName}". In demo mode use ${ensAgentFixture.name}.`);
    let face: bigint, price: bigint;
    try {
      face = parseUnits(input.face.trim());
      price = parseUnits(input.price.trim());
    } catch {
      throw new MockError("Amounts must be numbers like 10 or 9.5.");
    }
    if (face <= 0n || price <= 0n || price > face) throw new MockError("The price must be above 0 and no more than the face amount.");
    const due = Math.floor(new Date(`${input.dueDate}T12:00:00Z`).getTime() / 1000);
    if (!Number.isFinite(due) || due * 1000 < Date.now()) throw new MockError("Pick a due date in the future.");
    if (!input.description.trim()) throw new MockError("Add a short description.");
    const supplier = ("0x1111111111111111111111111111111111111111") as Address;
    const inv = mockStore.createInvoice(
      { buyerVault: ensAgentFixture.vault, faceAmount: face.toString(), price: price.toString(), dueDate: due, description: input.description.trim(), evidenceHash: input.evidenceHash },
      supplier,
    );
    return { id: inv.id };
  }, (d) => `Invoice #${d.id} created. It is Pending until the buyer accepts it.`);
}

// ---- buyer agent (demo controls until Rishita's buyer agent runs) ----
/** Real: BuyerVault.accept(market, id) by the buyer agent (owner: Rishita's agent, Mann's vault). */
export async function acceptInvoice(id: string): Promise<ActionResult> {
  if (!isMock) return notWired("Accepting", "Rishita (buyer agent) + Mann (BuyerVault.accept)");
  return run(() => void mockStore.accept(id), `Invoice #${id} accepted by the buyer. It is now open for funding.`);
}

/** Real: BuyerVault.payInvoice, with a World ID approval above the threshold (owners: Rishita, Mann, Sidd). */
export async function payInvoice(id: string): Promise<ActionResult<{ approvalId?: string }>> {
  if (!isMock) return notWired("Paying", "Rishita (buyer agent) + Mann (BuyerVault) + Sidd (approvals)");
  return run(
    () => {
      const r = mockStore.pay(id);
      return { approvalId: r.approvalId };
    },
    (d) => (d.approvalId ? "This payment is above the threshold, so it needs the sponsor's approval first." : `Invoice #${id} paid. The holder can claim it.`),
  );
}

/** Real: InvoiceMarket.markLate / markDefaulted after the due date (owner: Mann). */
export async function markLate(id: string): Promise<ActionResult> {
  if (!isMock) return notWired("Marking late", "Mann (InvoiceMarket.markLate)");
  return run(() => void mockStore.markLate(id), `Invoice #${id} marked Late.`);
}

export async function markDefaulted(id: string): Promise<ActionResult> {
  if (!isMock) return notWired("Marking defaulted", "Mann (InvoiceMarket.markDefaulted)");
  return run(() => void mockStore.markDefaulted(id), `Invoice #${id} marked Defaulted.`);
}

// ---- sponsor ----
/** Real: World ID step-up via POST /api/approvals and /api/world/callback (owner: Sidd). */
export async function decideApproval(id: string, approve: boolean): Promise<ActionResult> {
  if (!isMock) return notWired("Sponsor approval", "Sidd (World ID approvals)");
  return run(() => void mockStore.decideApproval(id, approve), approve ? "Approved. The buyer agent can now pay this invoice." : "Rejected. The buyer agent will not pay this invoice.");
}

export async function resetDemo(): Promise<ActionResult> {
  if (!isMock) return { ok: false, message: "Reset only exists in demo mode." };
  mockStore.reset();
  revalidatePath("/", "layout");
  return { ok: true, message: "Demo data reset." };
}
