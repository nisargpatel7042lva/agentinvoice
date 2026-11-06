// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { STATUSES, approvalFixture, ensAgentFixture, invoiceFixtures, payPolicyFixture } from "@agentinvoice/shared";
import { ApprovalCard } from "./ApprovalCard";
import { EmptyState } from "./EmptyState";
import { EnsPanel } from "./EnsPanel";
import { InvoiceCard } from "./InvoiceCard";
import { PolicyPanel } from "./PolicyPanel";
import { ScoreBadge } from "./ScoreBadge";
import { StatusBadge } from "./StatusBadge";
import { Toast } from "./Toast";
import { TxLink } from "./TxLink";
import { copy } from "@/lib/copy";

afterEach(cleanup);

describe("components render", () => {
  it("StatusBadge shows every status as text", () => {
    for (const s of STATUSES) render(<StatusBadge status={s} />);
    for (const s of STATUSES) expect(screen.getByText(s)).toBeTruthy();
  });

  it("ScoreBadge shows band and value, but no value for New", () => {
    render(<ScoreBadge band="A" value={86} />);
    render(<ScoreBadge band="New" value={null} />);
    expect(screen.getByText("A · 86")).toBeTruthy();
    expect(screen.getByText("New")).toBeTruthy();
  });

  it("InvoiceCard, PolicyPanel, TxLink, EmptyState, Toast", () => {
    render(<InvoiceCard invoice={invoiceFixtures[1]} band="B" />);
    render(<PolicyPanel policy={payPolicyFixture} dailyLimit="5000000000" threshold="1000000000" spentToday="0" allowedSuppliers={2} />);
    render(<TxLink address={ensAgentFixture.vault} />);
    render(<EmptyState message={copy.empty.market} />);
    render(<Toast kind="error" message={copy.error.generic} />);
    expect(screen.getByText(copy.invoice.title("2"))).toBeTruthy();
    expect(screen.getByText(copy.policy.title)).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toContain("hashscan.io/testnet/address/");
    expect(screen.getByText(copy.empty.market)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(copy.error.generic);
  });

  it("EnsPanel present, missing, expired, revoked, unreachable", () => {
    const { unmount } = render(<EnsPanel state={{ kind: "present", agent: ensAgentFixture }} vaultOnChain={ensAgentFixture.vault} />);
    expect(screen.getByText(copy.ens.addrMatch)).toBeTruthy();
    expect(screen.getAllByText(copy.ens.setBy.sponsor).length).toBe(3);
    unmount();
    const cases = [
      [{ kind: "missing" }, copy.ens.missing],
      [{ kind: "expired", agent: { ...ensAgentFixture, expiresAt: 1 } }, copy.ens.expired],
      [{ kind: "revoked" }, copy.ens.revoked],
      [{ kind: "unreachable" }, copy.ens.unreachable],
    ] as const;
    for (const [state, text] of cases) {
      const r = render(<EnsPanel state={state} />);
      expect(screen.getByText(text)).toBeTruthy();
      r.unmount();
    }
  });

  it("ApprovalCard shows buttons only while pending", () => {
    const r = render(<ApprovalCard approval={approvalFixture} agentName="buyer-agent.eth" amount="1200000000" threshold="1000000000" />);
    expect(screen.getByText(copy.approval.approve)).toBeTruthy();
    r.unmount();
    render(<ApprovalCard approval={{ ...approvalFixture, state: "expired" }} agentName="x" amount="1" threshold="1" />);
    expect(screen.queryByText(copy.approval.approve)).toBeNull();
    expect(screen.getByText(copy.approval.expired)).toBeTruthy();
  });
});
