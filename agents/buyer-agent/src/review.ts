import type { Hash32, Invoice } from "@agentinvoice/shared";
import { z } from "zod";

export const REVIEW_MAX_TOKENS = 300;

const reviewSchema = z.object({
  action: z.enum(["accept", "dispute", "escalate"]),
  reason: z.string().trim().min(1).max(500),
});

export type InvoiceReview = z.infer<typeof reviewSchema>;

export interface ModelRequest {
  system: string;
  user: string;
  maxTokens: number;
}

export interface InvoiceModel {
  complete(request: ModelRequest): Promise<string>;
}

export interface AnthropicMessagesClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: "user"; content: string }[];
    }): Promise<{ content: { type: string; text?: string }[] }>;
  };
}

const SYSTEM = [
  "You review one invoice for a buyer vault.",
  'Reply with JSON only: {"action":"accept"|"dispute"|"escalate","reason":"..."}',
  "Accept only when the description and evidence clearly support this invoice.",
  "Dispute when they contradict the invoice, evidence is missing, it looks duplicated, or the amount looks suspicious.",
  "Escalate when you are uncertain.",
  "You cannot waive a vault limit, a balance check, or an approval requirement.",
].join(" ");

const UNCERTAIN = /\b(unsure|uncertain|not sure|cannot determine|can't determine)\b/i;

function escalate(reason: string): InvoiceReview {
  return { action: "escalate", reason };
}

function parseReview(raw: string): InvoiceReview {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return escalate("model response was not valid JSON");
  }
  const parsed = reviewSchema.safeParse(data);
  if (!parsed.success) return escalate("model response was malformed");
  if (parsed.data.action !== "escalate" && UNCERTAIN.test(parsed.data.reason)) {
    return escalate("model response was uncertain");
  }
  return parsed.data;
}

function userPrompt(invoice: Invoice, description: string, evidenceHash: Hash32): string {
  return [
    `id: ${invoice.id}`,
    `status: ${invoice.status}`,
    `supplier: ${invoice.supplier}`,
    `buyerVault: ${invoice.buyerVault}`,
    `faceAmount: ${invoice.faceAmount}`,
    `price: ${invoice.price}`,
    `dueDate: ${invoice.dueDate}`,
    `description: ${description}`,
    `evidenceHash: ${evidenceHash}`,
  ].join("\n");
}

/** Ask the model about one invoice. A bad or failed reply becomes escalate, never accept. */
export async function reviewInvoice(
  invoice: Invoice,
  description: string,
  evidenceHash: Hash32,
  model: InvoiceModel,
): Promise<InvoiceReview> {
  try {
    const raw = await model.complete({
      system: SYSTEM,
      user: userPrompt(invoice, description, evidenceHash),
      maxTokens: REVIEW_MAX_TOKENS,
    });
    return parseReview(raw);
  } catch {
    return escalate("model request failed");
  }
}

/** Wrap the Anthropic messages API. The model name is passed in; this file does not choose one. */
export function createAnthropicReviewModel(client: AnthropicMessagesClient, model: string): InvoiceModel {
  return {
    async complete(request) {
      const message = await client.messages.create({
        model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
      });
      return message.content
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text ?? "")
        .join("");
    },
  };
}
