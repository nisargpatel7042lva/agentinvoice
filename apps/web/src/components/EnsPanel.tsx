import { ENS_ROLES, type Address, type EnsAgent } from "@agentinvoice/shared";
import { copy } from "@/lib/copy";
import { formatAmount, formatDate, shortHex } from "@/lib/format";
import { Card, Row } from "./Card";

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
  const cls = tone === "danger" ? "border-danger bg-status-defaulted-bg text-status-defaulted" : "border-line bg-canvas text-ink-muted";
  return (
    <p role="alert" className={`rounded-md border p-3 text-sm ${cls}`}>
      {text}
    </p>
  );
}

export function EnsPanel({ state, vaultOnChain }: { state: EnsState; vaultOnChain?: Address }) {
  if (state.kind === "unreachable") return <Card title={copy.ens.title}><Notice tone="muted" text={copy.ens.unreachable} /></Card>;
  if (state.kind === "missing") return <Card title={copy.ens.title}><Notice tone="muted" text={copy.ens.missing} /></Card>;

  const agent = state.agent;
  const match = agent && vaultOnChain ? agent.vault.toLowerCase() === vaultOnChain.toLowerCase() : undefined;

  return (
    <Card title={copy.ens.title}>
      {state.kind === "expired" && <Notice tone="danger" text={copy.ens.expired} />}
      {state.kind === "revoked" && <Notice tone="danger" text={copy.ens.revoked} />}
      {agent && (
        <dl className="mt-2">
          {ENS_ROLES.map(({ record, setBy }) => (
            <Row key={record} label={copy.ens.labels[record]}>
              {value(agent, record)}
              <span className="block text-xs font-normal text-ink-faint">{copy.ens.setBy[setBy]}</span>
            </Row>
          ))}
        </dl>
      )}
      {match === true && <p className="mt-2 text-xs text-status-paid">{copy.ens.addrMatch}</p>}
      {match === false && <Notice tone="danger" text={copy.ens.addrMismatch} />}
    </Card>
  );
}
