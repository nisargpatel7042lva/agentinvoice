import { afterEach, describe, expect, it, vi } from "vitest";
import type { Invoice } from "@invoiceagent/shared";
import { createAnthropicReviewModel, reviewInvoice, type InvoiceModel } from "./review.js";

const PRIVATE_KEY = `0x${"ab".repeat(32)}`;

function invoice(): Invoice {
  return {
    id: "7",
    supplier: "0x1111111111111111111111111111111111111111",
    buyerVault: "0x2222222222222222222222222222222222222222",
    faceAmount: "100",
    price: "90",
    dueDate: 2_000,
    status: "Pending",
    bond: null,
    holder: null,
    evidenceHash: `0x${"cd".repeat(32)}`,
    description: "10 boxes of paper delivered to the loading dock",
  };
}

function model(raw: string | Error): InvoiceModel & { requests: { system: string; user: string; maxTokens: number }[] } {
  const requests: { system: string; user: string; maxTokens: number }[] = [];
  return {
    requests,
    async complete(request) {
      requests.push(request);
      if (raw instanceof Error) throw raw;
      return raw;
    },
  };
}

describe("reviewInvoice", () => {
  afterEach(() => {
    delete process.env.BUYER_AGENT_PRIVATE_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    vi.restoreAllMocks();
  });

  it("returns accept when the model returns valid accept JSON", async () => {
    const wired = model(JSON.stringify({ action: "accept", reason: "delivery matches the evidence" }));
    await expect(reviewInvoice(invoice(), invoice().description, invoice().evidenceHash, wired)).resolves.toEqual({
      action: "accept",
      reason: "delivery matches the evidence",
    });
  });

  it("returns dispute when the model returns valid dispute JSON", async () => {
    const wired = model(JSON.stringify({ action: "dispute", reason: "the delivery does not match" }));
    const result = await reviewInvoice(invoice(), invoice().description, invoice().evidenceHash, wired);
    expect(result.action).toBe("dispute");
  });

  it("returns escalate when the model response is not JSON", async () => {
    const wired = model("accept this invoice");
    const result = await reviewInvoice(invoice(), invoice().description, invoice().evidenceHash, wired);
    expect(result).toEqual({ action: "escalate", reason: "model response was not valid JSON" });
  });

  it("returns escalate when the action is not one of the three decisions", async () => {
    const wired = model(JSON.stringify({ action: "approve", reason: "looks fine" }));
    const result = await reviewInvoice(invoice(), invoice().description, invoice().evidenceHash, wired);
    expect(result.action).toBe("escalate");
  });

  it("returns escalate when the reason is empty", async () => {
    const wired = model(JSON.stringify({ action: "accept", reason: "  " }));
    const result = await reviewInvoice(invoice(), invoice().description, invoice().evidenceHash, wired);
    expect(result.action).toBe("escalate");
  });

  it("returns escalate when the model says it is uncertain", async () => {
    const wired = model(JSON.stringify({ action: "accept", reason: "I am not sure the evidence matches" }));
    const result = await reviewInvoice(invoice(), invoice().description, invoice().evidenceHash, wired);
    expect(result).toEqual({ action: "escalate", reason: "model response was uncertain" });
  });

  it("returns escalate when the model call throws and does not leak the error", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const wired = model(new Error("request failed using sk-ant-secret123"));
    const result = await reviewInvoice(invoice(), invoice().description, invoice().evidenceHash, wired);
    expect(result).toEqual({ action: "escalate", reason: "model request failed" });
    expect(JSON.stringify(result)).not.toContain("sk-ant-secret123");
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not send a private key or API key to the model", async () => {
    process.env.BUYER_AGENT_PRIVATE_KEY = PRIVATE_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-api-key-value";
    const wired = model(JSON.stringify({ action: "dispute", reason: "evidence is missing" }));
    await reviewInvoice(invoice(), invoice().description, invoice().evidenceHash, wired);
    const sent = `${wired.requests[0]?.system}\n${wired.requests[0]?.user}`;
    expect(sent).not.toContain(PRIVATE_KEY);
    expect(sent).not.toContain("sk-ant-api-key-value");
    expect(wired.requests[0]?.maxTokens).toBe(300);
    expect(sent).toContain("10 boxes of paper");
  });
});

describe("createAnthropicReviewModel", () => {
  it("calls messages.create and reads the text block", async () => {
    const create = vi.fn(async () => ({
      content: [
        { type: "thinking", text: "hidden" },
        { type: "text", text: "{\"action\":\"escalate\",\"reason\":\"need a person\"}" },
      ],
    }));
    const wired = createAnthropicReviewModel({ messages: { create } }, "model-from-caller");
    const text = await wired.complete({ system: "rules", user: "invoice 7", maxTokens: 300 });
    expect(text).toBe("{\"action\":\"escalate\",\"reason\":\"need a person\"}");
    expect(create).toHaveBeenCalledWith({
      model: "model-from-caller",
      max_tokens: 300,
      system: "rules",
      messages: [{ role: "user", content: "invoice 7" }],
    });
  });
});
