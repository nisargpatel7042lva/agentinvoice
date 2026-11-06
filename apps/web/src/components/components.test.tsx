// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HowItWorks } from "./HowItWorks";
import { Section } from "./Section";
import { Term } from "./Term";
import { THEME_KEY, ThemeToggle } from "./ThemeToggle";
import { STATUSES, approvalFixture, ensAgentFixture, invoiceFixtures, payPolicyFixture } from "@agentinvoice/shared";
import { ApprovalCard } from "./ApprovalCard";
import { EmptyState } from "./EmptyState";
import { EnsPanel, PermissionsPanel } from "./EnsPanel";
import { Stepper } from "./Stepper";
import { InvoiceCard } from "./InvoiceCard";
import { PolicyPanel } from "./PolicyPanel";
import { ScoreBadge } from "./ScoreBadge";
import { CibilBadge } from "./CibilBadge";
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

  it("CibilBadge shows tier, score and label correctly", () => {
    const { unmount } = render(<CibilBadge tier="Excellent" score={780} label="Supplier" />);
    expect(screen.getByText("780")).toBeTruthy();
    expect(screen.getByText("(Excellent)")).toBeTruthy();
    expect(screen.getByText("Supplier:")).toBeTruthy();
    unmount();

    render(<CibilBadge tier="New" score={0} />);
    expect(screen.getByText("New")).toBeTruthy();
    expect(screen.getByText("(New)")).toBeTruthy();
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

  it("PermissionsPanel is built from ENS_ROLES", () => {
    render(<PermissionsPanel />);
    expect(screen.getByText("addr, limit, threshold")).toBeTruthy();
    expect(screen.getByText("paid, late, status")).toBeTruthy();
    expect(screen.getByText("expires")).toBeTruthy();
  });

  it("HowItWorks shows three steps and hides once dismissed", async () => {
    localStorage.clear();
    render(<HowItWorks />);
    expect(await screen.findByText(copy.onboarding.steps[0].title)).toBeTruthy();
    fireEvent.click(screen.getByText(copy.onboarding.dismiss));
    expect(screen.queryByText(copy.onboarding.title)).toBeNull();
    expect(localStorage.getItem("ai.onboarding.dismissed")).toBe("1");
  });

  it("Section starts closed and Term explains jargon", () => {
    render(<Section title="Details">hidden body</Section>);
    expect(screen.getByText("Details").closest("details")?.open).toBe(false);
    render(<Term explain="sponsor">Sponsor</Term>);
    expect(screen.getByRole("tooltip").textContent).toBe(copy.glossary.sponsor);
  });

  it("ThemeToggle flips data-theme and remembers the choice", async () => {
    localStorage.clear();
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle />);
    fireEvent.click(await screen.findByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("Stepper marks Late in place of Paid", () => {
    render(<Stepper status="Late" />);
    expect(screen.getByText("Late")).toBeTruthy();
    expect(screen.queryByText("Paid")).toBeNull();
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
