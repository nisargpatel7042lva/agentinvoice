/**
 * Mirror Node balance / association helpers for swap preflight and post-verify.
 */
import type { SaucerSwapConfig, SaucerSwapDeps } from "./types";

interface MirrorAccountBalance {
  balance?: { balance?: number | string };
}

interface MirrorTokenBalance {
  tokens?: Array<{ token_id?: string; balance?: number | string }>;
}

async function getJson<T>(url: string, f: typeof fetch): Promise<T> {
  const res = await f(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mirror GET ${url} → HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Account HBAR balance in tinybar. */
export async function getHbarBalance(
  accountId: string,
  config: SaucerSwapConfig,
  deps: SaucerSwapDeps = {},
): Promise<bigint> {
  if (deps.getHbarBalance) return deps.getHbarBalance(accountId);
  const f = deps.fetch ?? fetch;
  const data = await getJson<MirrorAccountBalance>(`${config.mirrorNodeUrl}/api/v1/accounts/${accountId}`, f);
  const raw = data.balance?.balance;
  if (raw === undefined || raw === null) throw new Error(`No HBAR balance for ${accountId}`);
  return BigInt(raw);
}

/** HTS token balance in the token's smallest unit (0 if associated with zero balance). */
export async function getTokenBalance(
  accountId: string,
  tokenId: string,
  config: SaucerSwapConfig,
  deps: SaucerSwapDeps = {},
): Promise<bigint> {
  if (deps.getTokenBalance) return deps.getTokenBalance(accountId, tokenId);
  const f = deps.fetch ?? fetch;
  const data = await getJson<MirrorTokenBalance>(
    `${config.mirrorNodeUrl}/api/v1/accounts/${accountId}/tokens?token.id=${encodeURIComponent(tokenId)}&limit=1`,
    f,
  );
  const row = data.tokens?.find((t) => t.token_id === tokenId);
  if (!row) return 0n;
  return BigInt(row.balance ?? 0);
}

/** True when the account has associated the HTS token. */
export async function isTokenAssociated(
  accountId: string,
  tokenId: string,
  config: SaucerSwapConfig,
  deps: SaucerSwapDeps = {},
): Promise<boolean> {
  if (deps.isTokenAssociated) return deps.isTokenAssociated(accountId, tokenId);
  const f = deps.fetch ?? fetch;
  const data = await getJson<MirrorTokenBalance>(
    `${config.mirrorNodeUrl}/api/v1/accounts/${accountId}/tokens?token.id=${encodeURIComponent(tokenId)}&limit=1`,
    f,
  );
  return Boolean(data.tokens?.some((t) => t.token_id === tokenId));
}

export type AffordabilityCheck =
  | { ok: true; hbarBalance: bigint }
  | {
      ok: false;
      code: "INSUFFICIENT_HBAR" | "INSUFFICIENT_RESERVE";
      reason: string;
      hbarBalance: bigint;
    };

/**
 * Ensure balance covers amountIn + gasReserve (gas reserve must remain after spend).
 */
export function checkHbarAffordability(
  hbarBalance: bigint,
  amountInTinybar: bigint,
  gasReserveTinybar: bigint,
): AffordabilityCheck {
  if (hbarBalance < amountInTinybar) {
    return {
      ok: false,
      code: "INSUFFICIENT_HBAR",
      reason: `HBAR balance ${hbarBalance} tinybar is below swap amount ${amountInTinybar}`,
      hbarBalance,
    };
  }
  if (hbarBalance - amountInTinybar < gasReserveTinybar) {
    return {
      ok: false,
      code: "INSUFFICIENT_RESERVE",
      reason: `After swap, remaining ${hbarBalance - amountInTinybar} tinybar is below gas reserve ${gasReserveTinybar}`,
      hbarBalance,
    };
  }
  return { ok: true, hbarBalance };
}
