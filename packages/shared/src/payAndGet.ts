// Real x402 on Hedera: request → 402 challenge → check our spending policy → sign an HBAR transfer → retry → settled.
// Follows Hedera's x402 guide (native-services-js/x402-payments): amounts in tinybars, asset "0.0.0", payTo is a 0.0.x
// account id, and a facilitator (e.g. Blocky402) co-signs as fee payer and submits.
// Import from "@invoiceagent/shared/payAndGet" (agents and scripts only): it pulls in the Hedera SDK, which the
// website must not bundle.
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import type { PayPolicy } from "./types";

type PaymentRequired = ReturnType<x402HTTPClient["getPaymentRequiredResponse"]>;
type Requirement = PaymentRequired["accepts"][number];

export interface PayAndGetOptions {
  /** Spending rules. Amounts in tinybars; allowedPayTo are Hedera account ids (0.0.x). */
  policy?: Partial<PayPolicy>;
  /** The payer's Hedera account id (0.0.x) and its ECDSA private key (hex). */
  accountId?: string;
  privateKey?: string;
  network?: string;
  onAudit?: (event: { type: string; url: string; amount?: string; reason?: string; txId?: string }) => Promise<void> | void;
  /** Injection points for tests. */
  fetch?: typeof fetch;
  signPayment?: (paymentRequired: PaymentRequired) => Promise<Record<string, string>>;
}

export type PayAndGetResult<T> = { ok: true; data: T; txId?: string; amount?: string } | { ok: false; reason: string; status?: number };

let spend = { day: Math.floor(Date.now() / 86_400_000), spent: 0n };
export function getSpentToday(): bigint {
  const day = Math.floor(Date.now() / 86_400_000);
  if (day !== spend.day) spend = { day, spent: 0n };
  return spend.spent;
}
export function resetSpentTodayForTesting(): void {
  spend = { day: Math.floor(Date.now() / 86_400_000), spent: 0n };
}

function makeSigner(opts: PayAndGetOptions, network: string) {
  if (!opts.accountId || !opts.privateKey) return null;
  const key = PrivateKey.fromStringECDSA(opts.privateKey.replace(/^0x/, ""));
  const signer = createClientHederaSigner(opts.accountId, key, { network: network as `${string}:${string}` });
  const http = new x402HTTPClient(new x402Client().register("hedera:*", new ExactHederaScheme(signer)));
  return async (pr: PaymentRequired) => http.encodePaymentSignatureHeader(await http.createPaymentPayload(pr));
}

/** Policy check on the real requirement, before anything is signed. Returns a refusal reason or null. */
function refuse(req: Requirement, url: URL, policy: Partial<PayPolicy> | undefined, network: string): string | null {
  if (req.network !== network) return `Network ${req.network} is not ${network}`;
  if (req.asset !== "0.0.0") return `Asset ${req.asset} is not native HBAR`;
  const amount = BigInt(req.amount);
  if (policy?.allowedHosts?.length && !policy.allowedHosts.some((h) => h === url.host || h === url.hostname)) return `Host ${url.hostname} not allowed by policy`;
  if (policy?.perCallCap && amount > BigInt(policy.perCallCap)) return `Requested payment ${amount} exceeds per-call cap ${policy.perCallCap}`;
  if (policy?.dailyBudget && getSpentToday() + amount > BigInt(policy.dailyBudget)) return `Daily budget exhausted (${getSpentToday()} + ${amount} > ${policy.dailyBudget})`;
  if (policy?.allowedPayTo?.length && !policy.allowedPayTo.some((a) => a.toLowerCase() === req.payTo.toLowerCase())) return `Recipient ${req.payTo} not allowed`;
  return null;
}

export async function payAndGet<T>(url: string, opts: PayAndGetOptions = {}): Promise<PayAndGetResult<T>> {
  const f = opts.fetch ?? fetch;
  const network = opts.network ?? "hedera:testnet";
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { ok: false, reason: `Invalid URL: ${url}` };
  }
  if (opts.policy?.allowedHosts?.length && !opts.policy.allowedHosts.some((h) => h === target.host || h === target.hostname)) {
    const reason = `Host ${target.hostname} not allowed by policy`;
    await opts.onAudit?.({ type: "x402.refusal", url, reason });
    return { ok: false, reason };
  }

  let first: Response;
  try {
    first = await f(url);
  } catch (e) {
    return { ok: false, reason: `Network request failed: ${(e as Error).message}` };
  }
  if (first.ok) return { ok: true, data: (await first.json()) as T };
  if (first.status !== 402) return { ok: false, status: first.status, reason: `HTTP ${first.status}: ${await first.text().catch(() => "")}` };

  // Read the 402 challenge with the official client (PAYMENT-REQUIRED header, JSON body as fallback).
  const reader = new x402HTTPClient(new x402Client());
  let pr: PaymentRequired;
  try {
    pr = reader.getPaymentRequiredResponse((h) => first.headers.get(h), await first.clone().json().catch(() => undefined));
  } catch {
    return { ok: false, status: 402, reason: "The server answered 402 without valid x402 payment requirements" };
  }
  const req = pr.accepts.find((a) => a.network === network) ?? pr.accepts[0];
  if (!req) return { ok: false, status: 402, reason: "No payment option offered" };

  const reason = refuse(req, target, opts.policy, network);
  if (reason) {
    await opts.onAudit?.({ type: "x402.refusal", url, amount: req.amount, reason });
    return { ok: false, reason };
  }

  const sign = opts.signPayment ?? makeSigner(opts, network);
  if (!sign) return { ok: false, reason: "No payer configured: set the Hedera account id and private key" };

  let headers: Record<string, string>;
  try {
    headers = await sign({ ...pr, accepts: [req] });
  } catch (e) {
    return { ok: false, reason: `Could not sign the payment: ${(e as Error).message}` };
  }

  const paid = await f(url, { headers });
  if (!paid.ok) {
    await opts.onAudit?.({ type: "x402.failed", url, amount: req.amount, reason: `HTTP ${paid.status}` });
    return { ok: false, status: paid.status, reason: `Paid request failed with HTTP ${paid.status}` };
  }

  let txId: string | undefined;
  try {
    txId = reader.getPaymentSettleResponse((h) => paid.headers.get(h)).transaction || undefined;
  } catch {
    txId = undefined; // settled resource without a receipt header: still paid, just no tx id to show
  }
  spend.spent = getSpentToday() + BigInt(req.amount);
  await opts.onAudit?.({ type: "x402.payment", url, amount: req.amount, txId });
  return { ok: true, data: (await paid.json()) as T, txId, amount: req.amount };
}
