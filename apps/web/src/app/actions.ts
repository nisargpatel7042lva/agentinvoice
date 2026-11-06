"use server";
// Every button in the app calls one of these. This file is the contract between the UI and the rest of the team:
// mock mode changes the in-memory demo store; real mode is where each owner wires their piece.
// See docs/notes/frontend-actions.md.
import { revalidatePath } from "next/cache";
import { ApiError, createApiClient, parseUnits, type Hash32, type Invoice } from "@invoiceagent/shared";
import { lookupBuyer as lookupBuyerName, type BuyerLookup } from "@/lib/ens";

const backend = createApiClient({ baseUrl: process.env.NEXT_PUBLIC_BACKEND_URL });

/** Live buyer lookup for the create form: a 0x vault address, or an ENS name read from Sepolia. */
export async function lookupBuyer(input: string): Promise<BuyerLookup> {
  return lookupBuyerName(input);
}

// ---- profile: seller ENS name (the backend registers it on Sepolia and pays the gas) ----
const backendUrl = () => (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

export type Role = "buyer" | "seller";
export interface Profile {
  name: string | null; // the wallet's ENS name (seller name, or the buyer agent's name)
  parent: string | null;
  invoices: Invoice[];
  canMint: boolean;
  role: Role | null;
  vault: string | null; // the buyer's registered vault
}

/** The wallet's invoices (as supplier or holder), chosen role, and its minted ENS name. */
export async function loadProfile(owner: string): Promise<Profile> {
  const empty: Profile = { name: null, parent: null, invoices: [], canMint: false, role: null, vault: null };
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) return empty;
  const me = owner.toLowerCase();
  const all: Invoice[] = await backend.listInvoices().catch(() => []);
  const invoices = all.filter((i) => i.supplier.toLowerCase() === me || i.holder?.toLowerCase() === me);
  if (!backendUrl()) return { ...empty, invoices };
  const get = async <T,>(path: string): Promise<T | null> => {
    try {
      return (await (await fetch(`${backendUrl()}${path}`, { cache: "no-store" })).json()) as T;
    } catch {
      return null;
    }
  };
  const [names, roleRes, agents] = await Promise.all([
    get<{ name: string | null; parent: string | null }>(`/api/names/${owner}`),
    get<{ role: Role | null }>(`/api/roles/${owner}`),
    get<{ agents: { vault: string; name: string; owner: string }[] }>("/api/agents"),
  ]);
  const agent = agents?.agents.find((x) => x.owner.toLowerCase() === me);
  return {
    name: agent?.name ?? names?.name ?? null,
    parent: names?.parent ?? null,
    invoices,
    canMint: Boolean(names?.parent),
    role: roleRes?.role ?? null,
    vault: agent?.vault ?? null,
  };
}

async function signedPost<T>(path: string, body: unknown, ok: (j: T) => string, fallback: string): Promise<ActionResult<T>> {
  try {
    const r = await fetch(`${backendUrl()}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json()) as T & { message?: string; error?: string };
    if (!r.ok) return { ok: false, message: j.message ?? fallback };
    revalidatePath("/", "layout");
    return { ok: true, message: ok(j), data: j };
  } catch {
    return { ok: false, message: "Our server is not responding. Is the backend running?" };
  }
}

async function messageFrom(path: string): Promise<ActionResult<{ message: string }>> {
  try {
    const r = await fetch(`${backendUrl()}${path}`, { cache: "no-store" });
    if (!r.ok) return { ok: false, message: r.status === 503 ? "This is not set up on the backend." : "Those details are not valid." };
    return { ok: true, message: "ok", data: (await r.json()) as { message: string } };
  } catch {
    return { ok: false, message: "Our server is not responding. Is the backend running?" };
  }
}

export const roleMessage = (role: Role, owner: string) => messageFrom(`/api/roles/message?role=${role}&owner=${owner}`);
export const setRole = (role: Role, owner: string, signature: string) =>
  signedPost<{ role: Role }>("/api/roles", { role, owner, signature }, (j) => `You are a ${j.role}.`, "Could not save your role.");

export const buyerNameMessage = (label: string, owner: string, vault: string) =>
  messageFrom(`/api/buyers/message?label=${encodeURIComponent(label)}&owner=${owner}&vault=${vault}`);
export const mintBuyerName = (label: string, owner: string, vault: string, signature: string) =>
  signedPost<{ name: string; vault: string; txHash: string }>("/api/buyers", { label, owner, vault, signature }, (j) => `Registered ${j.name} for your vault on Sepolia.`, "Could not register the name.");

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

// ---- supplier ----
export interface CreateInvoiceInput {
  buyerName: string;
  face: string; // HBAR, e.g. "10.5"
  price: string;
  dueDate: string; // yyyy-mm-dd
  description: string;
  evidenceHash: Hash32;
}

/** POST /api/invoices: Sidd's backend creates the invoice on-chain from the issuer wallet and indexes it. */
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

// ---- sponsor ----
/** Real: World ID step-up via POST /api/approvals and /api/world/callback (owner: Sidd). */
export async function decideApproval(_id: string, approve: boolean, invoiceId?: string): Promise<ActionResult<{ redirectUrl?: string }>> {
  // Approvals happen at World ID: start a step-up for this invoice and send the sponsor there.
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
