// Draft shapes. TODO: align field names with the plan's spec before anyone builds on them.

export type Address = `0x${string}`;

export type Status = "draft" | "issued" | "approved" | "paid" | "rejected" | "cancelled";

export interface Agent {
  address: Address;
  ensName?: string;
}

export interface Invoice {
  id: string;
  issuer: Address;
  payer: Address;
  amount: bigint;
  dueAt: number; // unix seconds
  status: Status;
}

export interface Approval {
  invoiceId: string;
  approver: Address;
  approved: boolean;
  at: number; // unix seconds
}

export interface Score {
  agent: Address;
  value: number;
  updatedAt: number; // unix seconds
}
