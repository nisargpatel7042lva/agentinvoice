import { Check, TriangleAlert } from "lucide-react";
import { ENS_ROLES, type Address, type EnsAgent, type EnsSetter } from "@agentinvoice/shared";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { copy } from "@/lib/copy";
import { formatAmount, formatDate, shortHex } from "@/lib/format";

export type EnsState =
  | { kind: "present"; agent: EnsAgent }
  | { kind: "missing" }
  | { kind: "expired"; agent: EnsAgent }
  | { kind: "revoked"; agent?: EnsAgent }
  | { kind: "unreachable" };

function value(agent: EnsAgent, record: keyof EnsAgent): string {
  switch (record) {
    case "vault":
      return shortHex(agent.vault);
    case "limit":
    case "threshold":
      return formatAmount(agent[record]);
    case "expiresAt":
      return formatDate(agent.expiresAt);
    default:
      return String(agent[record]);
  }
}

function Notice({ tone, text }: { tone: "danger" | "muted"; text: string }) {
  const cls = tone === "danger" ? "border-status-defaulted/30 bg-status-defaulted-bg text-status-defaulted" : "border-line bg-canvas text-ink-muted";
  return (
    <p role="alert" className={`flex gap-2 rounded-lg border p-3 text-sm ${cls}`}>
      {tone === "danger" && <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 flex-none" />}
      {text}
    </p>
  );
}

export function EnsPanel({ state, vaultOnChain }: { state: EnsState; vaultOnChain?: Address }) {
  const agent = "agent" in state ? state.agent : undefined;
  const match = agent && vaultOnChain ? agent.vault.toLowerCase() === vaultOnChain.toLowerCase() : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.ens.title}</CardTitle>
        {state.kind === "present" && (
          <span className="flex items-center gap-1.5 text-xs text-status-paid">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-good" />
            Live
          </span>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {state.kind === "unreachable" && <Notice tone="muted" text={copy.ens.unreachable} />}
        {state.kind === "missing" && <Notice tone="muted" text={copy.ens.missing} />}
        {state.kind === "expired" && <Notice tone="danger" text={copy.ens.expired} />}
        {state.kind === "revoked" && <Notice tone="danger" text={copy.ens.revoked} />}
        {agent && (
          <dl className="m-0 text-sm">
            {ENS_ROLES.map(({ record, setBy }) => (
              <div key={record} className="flex justify-between gap-3 border-t border-subtle py-2.5 first:border-t-0">
                <dt>
                  <span className="block font-mono text-[13px]">{copy.ens.labels[record]}</span>
                  <span className="block text-[11px] text-ink-muted">{copy.ens.setBy[setBy]}</span>
                </dt>
                <dd className="m-0 text-right font-medium">{value(agent, record)}</dd>
              </div>
            ))}
          </dl>
        )}
        {match === true && (
          <p className="flex items-center gap-1.5 text-xs text-status-paid">
            <Check aria-hidden="true" className="size-3.5" />
            {copy.ens.addrMatch}
          </p>
        )}
        {match === false && <Notice tone="danger" text={copy.ens.addrMismatch} />}
      </CardContent>
    </Card>
  );
}

const ROLE_STYLE: Record<EnsSetter, string> = {
  sponsor: "bg-accent-soft text-accent",
  publisher: "bg-status-open-bg text-status-open",
  registry: "bg-subtle text-ink-soft",
};
const ROLE_NAME: Record<EnsSetter, string> = { sponsor: "Sponsor", publisher: "Publisher", registry: "Registry" };

/** Built from ENS_ROLES in @agentinvoice/shared, never typed by hand. */
export function PermissionsPanel() {
  const bySetter = (Object.keys(ROLE_NAME) as EnsSetter[]).map((s) => ({
    setter: s,
    records: ENS_ROLES.filter((r) => r.setBy === s).map((r) => copy.ens.labels[r.record]),
  }));
  return (
    <Card>
      <CardHeader><CardTitle>{copy.ens.permissionsTitle}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2.5 text-[13px]">
        {bySetter.map(({ setter, records }) => (
          <div key={setter} className="flex items-center gap-2.5">
            <Badge className={`w-20 justify-center ${ROLE_STYLE[setter]}`}>{ROLE_NAME[setter]}</Badge>
            <span className="text-ink-soft">{records.join(", ")}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
