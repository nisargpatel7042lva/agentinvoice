import { SAUCERSWAP_TESTNET_USDC } from "@invoiceagent/shared";
import { ApiError } from "@invoiceagent/shared";
import { Banner } from "@/components/Banner";
import { Section } from "@/components/Section";
import { api, isMock } from "@/lib/api";
import { formatAmount, formatUsdc } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TreasuryPage() {
  const [statusResult, quoteResult] = await Promise.all([
    api.getSaucerSwapStatus().then((s) => ({ ok: true as const, s })).catch((e: unknown) => ({ ok: false as const, e })),
    api.getSaucerSwapQuote().then((q) => ({ ok: true as const, q })).catch((e: unknown) => ({ ok: false as const, e })),
  ]);

  const unavailable =
    !statusResult.ok && statusResult.e instanceof ApiError && (statusResult.e.status === 503 || statusResult.e.status === 502);

  return (
    <div className="flex flex-col gap-8">
      <Banner
        hue="sage"
        eyebrow="SaucerSwap · Hedera testnet"
        title={
          <>
            USDC treasury
            <br />
            <em>HBAR in, USDC out.</em>
          </>
        }
        sub={
          <>
            Invoice market settlements stay in <strong>HBAR</strong> on-chain. Agents can optionally swap excess HBAR into{" "}
            <strong>{SAUCERSWAP_TESTNET_USDC.label}</strong> (<code className="font-mono text-[13px]">{SAUCERSWAP_TESTNET_USDC.tokenId}</code>) via
            SaucerSwap V2.
          </>
        }
        cards={
          <div className="grid gap-3">
            <div className="pl-card pl-lift rounded-2xl bg-white/70 p-4 text-[#161513]">
              <p className="font-mono text-[10.5px] tracking-[0.1em] text-[#161513]/55 uppercase">Swap target</p>
              <p className="mt-2 pl-serif text-[28px] leading-none">{SAUCERSWAP_TESTNET_USDC.symbol}</p>
              <p className="mt-2 text-sm text-[#161513]/70">{SAUCERSWAP_TESTNET_USDC.tokenId}</p>
            </div>
            <div className="pl-card rounded-2xl bg-white/55 p-4 text-sm text-[#161513]/75">
              Not Circle official testnet USDC (<code className="font-mono text-[12px]">{SAUCERSWAP_TESTNET_USDC.circleOfficialTokenId}</code>) — SaucerSwap
              has no pool for that token on testnet.
            </div>
          </div>
        }
      />

      {unavailable && (
        <p className="rounded-xl border border-line bg-surface px-5 py-4 text-sm text-ink-muted">
          SaucerSwap status is not configured on the backend yet. Set <code className="font-mono">SAUCERSWAP_STATUS=1</code> or{" "}
          <code className="font-mono">SAUCERSWAP_OPERATOR_ACCOUNT_ID</code>, or run in mock mode ({isMock ? "on" : "off"}).
        </p>
      )}

      {statusResult.ok && (
        <Section title="Operator balances" hint="Dedicated SAUCERSWAP_OPERATOR account" open>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Network</dt>
              <dd className="m-0 font-medium">{statusResult.s.network}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Dry-run</dt>
              <dd className="m-0 font-medium">{statusResult.s.dryRun ? "yes (no broadcast)" : "no"}</dd>
            </div>
            {statusResult.s.operator ? (
              <>
                <div>
                  <dt className="text-ink-muted">Account</dt>
                  <dd className="m-0 font-mono text-[13px]">{statusResult.s.operator.accountId}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">USDC associated</dt>
                  <dd className="m-0 font-medium">{statusResult.s.operator.usdcAssociated ? "yes" : "no — associate before live swap"}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">HBAR balance</dt>
                  <dd className="m-0 font-medium">{formatAmount(statusResult.s.operator.hbarTinybar)}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">USDC balance</dt>
                  <dd className="m-0 font-medium">{formatUsdc(statusResult.s.operator.usdcBaseUnits)}</dd>
                </div>
              </>
            ) : (
              <p className="sm:col-span-2 text-ink-muted">No operator account configured — quotes still work; live swaps need SAUCERSWAP_OPERATOR_*.</p>
            )}
          </dl>
        </Section>
      )}

      {quoteResult.ok && (
        <Section title="Live quote · 1 HBAR → USDC" hint={quoteResult.q.usdcLabel} open>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-ink-muted">You pay</dt>
              <dd className="m-0 font-medium">{formatAmount(quoteResult.q.amountInTinybar)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Expected out</dt>
              <dd className="m-0 font-medium">{formatUsdc(quoteResult.q.amountOut)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Min out (slippage)</dt>
              <dd className="m-0 font-medium">{formatUsdc(quoteResult.q.amountOutMinimum)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-ink-muted">{quoteResult.q.caveat}</p>
        </Section>
      )}

      <Section title="How to run a real swap" hint="Funded testnet operator required">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-muted">
          <li>Create a dedicated Hedera testnet account and fund it with HBAR (portal.hedera.com).</li>
          <li>
            Set <code className="font-mono">SAUCERSWAP_OPERATOR_ACCOUNT_ID</code> and <code className="font-mono">SAUCERSWAP_OPERATOR_PRIVATE_KEY</code> in
            `.env` (names only in `.env.example`).
          </li>
          <li>
            Associate USDC <code className="font-mono">{SAUCERSWAP_TESTNET_USDC.tokenId}</code>:{" "}
            <code className="font-mono">bunx tsx --env-file-if-exists=.env scripts/saucerswap-hbar-to-usdc.ts associate</code>
          </li>
          <li>
            Dry-run first (<code className="font-mono">DRY_RUN=1</code>), then unset dry-run and run{" "}
            <code className="font-mono">… swap 1</code> for 1 HBAR.
          </li>
          <li>
            Optional agent loop: <code className="font-mono">SAUCERSWAP_ENABLE_AGENT_SWAP=1</code> on the investor agent (keeps HBAR reserve, swaps excess).
          </li>
        </ol>
      </Section>
    </div>
  );
}
