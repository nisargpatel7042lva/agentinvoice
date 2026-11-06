import "server-only";
import { createApiClient } from "@invoiceagent/shared";
import { isMock } from "./env";
import { mockStore } from "./mockStore";

export { isMock };

// Server-side reads. Mock mode reads the in-memory demo store (so button clicks show up);
// otherwise the real backend at NEXT_PUBLIC_BACKEND_URL.
const real = createApiClient({ baseUrl: process.env.NEXT_PUBLIC_BACKEND_URL });
const mockClient = createApiClient({ mock: true });

export const api = isMock
  ? {
      listInvoices: mockStore.listInvoices,
      getInvoice: mockStore.getInvoice,
      listAudit: mockStore.listAudit,
      getApproval: mockStore.getApproval,
      getScoreMock: mockStore.getScoreMock,
      getSaucerSwapStatus: mockClient.getSaucerSwapStatus,
      getSaucerSwapQuote: mockClient.getSaucerSwapQuote,
    }
  : {
      listInvoices: real.listInvoices,
      getInvoice: real.getInvoice,
      listAudit: real.listAudit,
      getApproval: real.getApproval,
      getScoreMock: real.getScoreMock,
      getSaucerSwapStatus: real.getSaucerSwapStatus,
      getSaucerSwapQuote: real.getSaucerSwapQuote,
    };
