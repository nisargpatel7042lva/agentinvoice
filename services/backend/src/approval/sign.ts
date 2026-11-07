import { encodeAbiParameters, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Signs the EIP-712 LargePayment message BuyerVault.payInvoice checks for payments above its approval threshold.
// This runs only after World ID has proved a human approved this exact invoice (see routes/approvals.ts). The key is the vault's
// `verifier`; the contract refuses a signature from anyone else, so a wrong key just makes payments fail, never overpay.

const TYPES = {
  LargePayment: [
    { name: "vault", type: "address" },
    { name: "invoiceId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

export interface ApprovalSigner {
  address: Address;
  sign(input: { vault: Address; invoiceId: bigint; amount: bigint; nonce: bigint; expiry: bigint }): Promise<Hex>;
}

export function createApprovalSigner(privateKey: Hex, chainId: number): ApprovalSigner {
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    sign: (m) =>
      account.signTypedData({
        domain: { name: "BuyerVault", version: "1", chainId, verifyingContract: m.vault },
        types: TYPES,
        primaryType: "LargePayment",
        message: { vault: m.vault, invoiceId: m.invoiceId, amount: m.amount, nonce: m.nonce, expiry: m.expiry },
      }),
  };
}

/** One unused contract nonce per approval: a hash of the approval id, so two approvals never share one. */
export const contractNonce = (approvalId: string): bigint => BigInt(keccak256(toHex(approvalId)));

/** The `approval` argument of payInvoice: abi.encode(nonce, expiry, signature). */
export const encodeApproval = (nonce: bigint, expiry: bigint, signature: Hex): Hex =>
  encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "bytes" }], [nonce, expiry, signature]);
