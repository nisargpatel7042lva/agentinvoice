import { createApiClient } from "@agentinvoice/shared";

// Literal process.env reads so Next inlines them at build time.
export const isMock = process.env.NEXT_PUBLIC_MOCK === "1";

export const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
  mock: isMock,
});
