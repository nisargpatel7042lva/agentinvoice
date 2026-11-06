import { describe, expect, it } from "vitest";
import { hederaTestnet } from "./index";

describe("hederaTestnet", () => {
  it("uses chain id 296", () => {
    expect(hederaTestnet.id).toBe(296);
  });
});
