import type { Amount, PayPolicy } from "@agentinvoice/shared";
import { copy } from "@/lib/copy";
import { formatAmount } from "@/lib/format";
import { Card, Row } from "./Card";

interface Props {
  policy: PayPolicy;
  dailyLimit: Amount;
  threshold: Amount;
  spentToday: Amount;
  allowedSuppliers: number;
}

export function PolicyPanel({ policy, dailyLimit, threshold, spentToday, allowedSuppliers }: Props) {
  return (
    <Card title={copy.policy.title}>
      <dl>
        <Row label={copy.agent.spentToday}>
          {formatAmount(spentToday)} / {formatAmount(dailyLimit)}
        </Row>
        <Row label={copy.policy.dailyLimit}>{formatAmount(dailyLimit)}</Row>
        <Row label={copy.policy.threshold}>{formatAmount(threshold)}</Row>
        <Row label={copy.policy.suppliers}>{allowedSuppliers}</Row>
        <Row label={copy.policy.perCallCap}>{formatAmount(policy.perCallCap)}</Row>
        <Row label={copy.policy.hosts}>{policy.allowedHosts.join(", ")}</Row>
      </dl>
    </Card>
  );
}
