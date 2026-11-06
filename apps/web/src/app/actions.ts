"use server";
// Every button in the app calls one of these. This file is the contract between the UI and the rest of the team:
// mock mode changes the in-memory demo store; real mode is where each owner wires their piece.
// See docs/notes/frontend-actions.md.
import { revalidatePath } from "next/cache";
import { ApiError, createApiClient, parseUnits, type Address, type Hash32, type Invoice } from "@invoiceagent/shared";
import { isMock } from "@/lib/env";
import { lookupBuyer as lookupBuyerName, type BuyerLookup } from "@/lib/ens";
import { MockError, mockStore } from "@/lib/mockStore";

const backend = createApiClient({ baseUrl: process.env.NEXT_PUBLIC_BACKEND_URL });

/** Live buyer lookup for the create form: a 0x vault address, or an ENS name read from Sepolia. */
export async function lookupBuyer(input: string): Promise<BuyerLookup> {
  return lookupBuyerName(input);
}

// ---- profile: seller ENS name (the backend registers it on Sepolia and pays the gas) ----
const backendUrl = () => (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

/** The wallet's invoices (as supplier or holder) and its minted ENS name. Mock mode has no names. */
export async function loadProfile(owner: string): Promise<{ name: string | null; parent: string | null; invoices: Invoice[]; canMint: boolean }> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) return { name: null, parent: null, invoices: [], canMint: false };
  const me = owner.toLowerCase();
  const all: Invoice[] = isMock ? await mockStore.listInvoices() : await backend.listInvoices().catch(() => []);
  const invoices = all.filter((i) => i.supplier.toLowerCase() === me || i.holder?.toLowerCase() === me);
  if (isMock || !backendUrl()) return { name: null, parent: null, invoices, canMint: false };
  try {
    const r = await fetch(`${backendUrl()}/api/names/${owner}`, { cache: "no-store" });
    const j = (await r.json()) as { name: string | null; parent: string | null };
    return { name: j.name, parent: j.parent, invoices, canMint: Boolean(j.parent) };
  } catch {
    return { name: null, parent: null, invoices, canMint: false };
  }
}

export async function nameClaimMessage(label: string, owner: string): Promise<ActionResult<{ message: string }>> {
  try {
    const r = await fetch(`${backendUrl()}/api/names/message?label=${encodeURIComponent(label)}&owner=${owner}`, { cache: "no-store" });
    if (!r.ok) return { ok: false, message: r.status === 503 ? "Name minting is not set up on the backend." : "That name or wallet is not valid." };
    return { ok: true, message: "ok", data: (await r.json()) as { message: string } };
  } catch {
    return { ok: false, message: "Our server is not responding. Is the backend running?" };
  }
}

export async function mintName(label: string, owner: string, signature: string): Promise<ActionResult<{ name: string; txHash: string }>> {
  try {
    const r = await fetch(`${backendUrl()}/api/names`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label, owner, signature }) });
    const j = (await r.json()) as { name?: string; txHash?: string; message?: string };
    if (!r.ok || !j.name || !j.txHash) return { ok: false, message: j.message ?? "Could not register the name." };
    revalidatePath("/", "layout");
    return { ok: true, message: `Registered ${j.name} on Sepolia.`, data: { name: j.name, txHash: j.txHash } };
  } catch {
    return { ok: false, message: "Our server is not responding. Is the backend running?" };
  }
}

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

/** Demo: in-memory store. Real: POST /api/invoices, where Sidd's backend creates it on-chain from the issuer wallet. */
export async function createInvoice(input: CreateInvoiceInput): Promise<ActionResult<{ id: string }>> {
  let face: bigint, price: bigint;
  try {
    face = parseUnits(input.face.trim());
    price = parseUnits(input.price.trim());
  } catch {
    return { ok: false, message: "Amounts must be numbers like 10 or 9.5." };
  }
  if (face <= 0n || price <= 0n || price > face) return { ok: false, message: "The price must be above 0 and no more than the face amount." };
  const due = Math.floor(new Date(`${input.dueDate}T12:00:00Z`).getTime() / 1000);
  if (!Number.isFinite(due) || due * 1000 < Date.now()) return { ok: false, message: "Pick a due date in the future." };
  if (!input.description.trim()) return { ok: false, message: "Add a short description." };
  const buyer = await lookupBuyerName(input.buyerName);
  if (buyer.kind === "unreachable") return { ok: false, message: "ENS is not reachable right now, so we cannot check this buyer. Try again, or use the buyer vault's 0x address." };
  if (buyer.kind !== "ok") return { ok: false, message: `We could not find an agent named "${input.buyerName}". Use its ENS name or the buyer vault's 0x address.` };
  const vault = buyer.vault;
  const body = { buyerVault: vault, faceAmount: face.toString(), price: price.toString(), dueDate: due, description: input.description.trim(), evidenceHash: input.evidenceHash };

  if (isMock) {
    return run(() => ({ id: mockStore.createInvoice(body, "0x1111111111111111111111111111111111111111").id }), (d) => `Invoice #${d.id} created. It is Pending until the buyer accepts it.`);
  }
  try {
    const inv = await backend.createInvoice(body);
    revalidatePath("/", "layout");
    return { ok: true, message: `Invoice #${inv.id} created on Hedera testnet. It is Pending until the buyer agent accepts it.`, data: { id: inv.id } };
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 0;
    const message =
      status === 503 ? "The backend has no issuer wallet configured (SUPPLIER_PRIVATE_KEY), so it cannot create invoices."
      : status === 409 ? "An invoice with this exact document already exists. Attach a different file."
      : status === 502 ? "The Hedera transaction failed. Check the issuer wallet has testnet HBAR."
      : status === 400 ? "The backend rejected these details. Check the amounts and due date."
      : "Our server is not responding. Is the backend running?";
    return { ok: false, message };
  }
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
export async function decideApproval(id: string, approve: boolean, invoiceId?: string): Promise<ActionResult<{ redirectUrl?: string }>> {
  if (!isMock) {
    // Real approvals happen at World ID: start a step-up for this invoice and send the sponsor there.
    // The backend's /api/world/callback marks it approved. Rejecting = not approving; the request expires.
    if (!approve) return { ok: true, message: "Not approved. The request expires on its own and the agent will not pay." };
    if (!invoiceId) return { ok: false, message: "Missing invoice for this approval." };
    try {
      const start = await backend.startApproval(invoiceId);
      return { ok: true, message: "Opening World ID to verify you are the sponsor…", data: { redirectUrl: start.authorizationUrl } };
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      return { ok: false, message: status === 503 ? "World ID approvals are not configured on the backend (WORLD_CLIENT_ID, WORLD_CLIENT_SECRET, WORLD_REDIRECT_URI)." : "Could not start the World ID approval. Is the backend running?" };
    }
  }
  return run(() => void mockStore.decideApproval(id, approve), approve ? "Approved. The buyer agent can now pay this invoice." : "Rejected. The buyer agent will not pay this invoice.");
}

export async function resetDemo(): Promise<ActionResult> {
  if (!isMock) return { ok: false, message: "Reset only exists in demo mode." };
  mockStore.reset();
  revalidatePath("/", "layout");
  return { ok: true, message: "Demo data reset." };
}
