import { describe, expect, it } from "vitest";
import { bandFor, computeScore, scoreValue, type ScoreInvoice } from "./score.js";

const inv = (status: ScoreInvoice["status"], faceAmount = "100"): ScoreInvoice => ({ status, faceAmount });
const many = (status: ScoreInvoice["status"], n: number) => Array.from({ length: n }, () => inv(status));

describe("bandFor", () => {
  it.each([
    [0, 0, "New"],
    [2, 2, "New"], // fewer than 3 settled
    [3, 3, "A"],
    [100, 95, "A"], // exactly 95%
    [100, 94, "B"],
    [100, 80, "B"], // exactly 80%
    [100, 79, "C"],
    [3, 0, "C"],
  ] as const)("%i settled, %i on time -> %s", (settled, paid, band) => {
    expect(bandFor(settled, paid)).toBe(band);
  });
});

describe("computeScore", () => {
  it("counts statuses, on-time rate and open exposure", () => {
    const s = computeScore([...many("Paid", 18), inv("Late"), inv("Defaulted"), inv("Funded", "250"), inv("Late", "50"), inv("Open")]);

    expect(s).toMatchObject({ paid: 18, late: 2, defaulted: 1, openExposure: "400", settled: 21 });
    expect(s.onTimeRate).toBeCloseTo(18 / 21);
    expect(s.band).toBe("B");
  });

  it("ignores Pending and Open invoices for the rate", () => {
    const s = computeScore([inv("Pending"), inv("Open")]);
    expect(s).toMatchObject({ settled: 0, onTimeRate: 0, band: "New", openExposure: "0" });
  });

  it("sums exposure without losing precision on huge amounts", () => {
    const s = computeScore([inv("Funded", "900000000000000000000"), inv("Late", "100000000000000000001")]);
    expect(s.openExposure).toBe("1000000000000000000001");
  });
});

describe("scoreValue", () => {
  it("maps the on-time rate to 0..100 and gives New agents 0", () => {
    expect(scoreValue({ band: "New", onTimeRate: 1 })).toBe(0);
    expect(scoreValue({ band: "A", onTimeRate: 0.956 })).toBe(96);
  });
});
