import type { Amount, PayPolicy } from "@agentinvoice/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { copy } from "@/lib/copy";
import { formatAmount } from "@/lib/format";

interface Props {
  policy: PayPolicy;
  dailyLimit: Amount;
  threshold: Amount;
  spentToday: Amount;
  allowedSuppliers: number;
}

export function PolicyPanel({ policy, dailyLimit, threshold, spentToday, allowedSuppliers }: Props) {
  const rows: [string, string][] = [
    [copy.agent.spentToday, `${formatAmount(spentToday)} / ${formatAmount(dailyLimit)}`],
    [copy.policy.dailyLimit, formatAmount(dailyLimit)],
    [copy.policy.threshold, formatAmount(threshold)],
    [copy.policy.suppliers, String(allowedSuppliers)],
    [copy.policy.perCallCap, formatAmount(policy.perCallCap)],
    [copy.policy.hosts, policy.allowedHosts.join(", ")],
  ];
  return (
    <Card>
      <CardHeader><CardTitle>{copy.policy.title}</CardTitle></CardHeader>
      <CardContent className="pt-1">
        <dl className="m-0 text-sm">
          {rows.map(([label, v]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-subtle py-2.5 last:border-0">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="m-0 text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
