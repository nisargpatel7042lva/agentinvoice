import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { computeCreditReport } from "@invoiceagent/shared";
import { mockStore } from "./mockStore";
import { sampleParties } from "./directory";

describe("mockStore credit scores for sample network buyers", () => {
  it("produces sensible scores across all 4 sample buyers (A, B, C, New)", async () => {
    const invoices = await mockStore.listInvoices();
    const audit = await mockStore.listAudit();

    const everLateIds = new Set<string>();
    for (const ev of audit) {
      if (ev.type === "invoice.late" && ev.invoiceId) {
        everLateIds.add(ev.invoiceId);
      }
    }

    // Invoice 11 was paid late
    expect(everLateIds.has("11")).toBe(true);

    const now = 1_795_000_000;

    // 1. buyer-agent.eth -> High score (Band A)
    const buyerVault = sampleParties.find((p) => p.name === "buyer-agent.eth")!.address;
    const reportBuyer = computeCreditReport({
      vault: buyerVault,
      invoices,
      everLateIds,
      dailyLimit: 5_000_000_000n, // 50 HBAR
      now,
    });
    expect(reportBuyer.band).toBe("A");
    expect(reportBuyer.score).toBeGreaterThanOrEqual(750);
    expect(reportBuyer.counts.paidLate).toBeGreaterThanOrEqual(1);

    // 2. northwind-agent.eth -> Band B
    const northwindVault = sampleParties.find((p) => p.name === "northwind-agent.eth")!.address;
    const reportNorthwind = computeCreditReport({
      vault: northwindVault,
      invoices,
      everLateIds,
      now,
    });
    expect(reportNorthwind.band).toBe("B");
    expect(reportNorthwind.score).toBeGreaterThanOrEqual(650);
    expect(reportNorthwind.score).toBeLessThan(750);

    // 3. globex-agent.eth -> Low score (Band C)
    const globexVault = sampleParties.find((p) => p.name === "globex-agent.eth")!.address;
    const reportGlobex = computeCreditReport({
      vault: globexVault,
      invoices,
      everLateIds,
      now,
    });
    expect(reportGlobex.band).toBe("C");
    expect(reportGlobex.score).toBeLessThan(650);
    expect(reportGlobex.counts.defaulted).toBeGreaterThanOrEqual(1);

    // 4. initech-agent.eth -> Brand New (null score)
    const initechVault = sampleParties.find((p) => p.name === "initech-agent.eth")!.address;
    const reportInitech = computeCreditReport({
      vault: initechVault,
      invoices,
      everLateIds,
      now,
    });
    expect(reportInitech.band).toBe("New");
    expect(reportInitech.score).toBeNull();
    expect(reportInitech.counts.settled).toBeLessThan(3);
  });
});
