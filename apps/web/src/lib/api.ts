import "server-only";
import { createApiClient } from "@invoiceagent/shared";

// Server-side reads from Sidd's backend (NEXT_PUBLIC_BACKEND_URL), which indexes the Hedera contracts.
const real = createApiClient({ baseUrl: process.env.NEXT_PUBLIC_BACKEND_URL });

export const api = {
  listInvoices: real.listInvoices,
  getInvoice: real.getInvoice,
  listAudit: real.listAudit,
  getApproval: real.getApproval,
  getScoreMock: real.getScoreMock,
  getSaucerSwapStatus: real.getSaucerSwapStatus,
  getSaucerSwapQuote: real.getSaucerSwapQuote,
};
