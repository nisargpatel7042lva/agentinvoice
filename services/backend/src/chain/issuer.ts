import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "@invoiceagent/shared";
import type { ChainInvoice } from "../indexer.js";
import { hedera, hederaReader, marketAbi } from "./reader.js";

// Creates invoices on-chain from ONE configured supplier wallet (SUPPLIER_PRIVATE_KEY). InvoiceMarket.createInvoice sets
// supplier = msg.sender, so every invoice created through POST /api/invoices has this wallet as its supplier. That is a
// demo-mode custodial issuer: a real supplier would sign createInvoice with their own wallet.

export interface IssueArgs {
  buyerVault: Address;
  faceAmount: bigint;
  price: bigint;
  dueDate: bigint;
  evidenceHash: Hex;
}

export interface IssuedInvoice {
  id: string;
  invoice: ChainInvoice;
  txHash: Hex;
}

export interface InvoiceIssuer {
  createInvoice(args: IssueArgs): Promise<IssuedInvoice>;
}

export class IssuerError extends Error {
  constructor(
    readonly code: "reverted" | "unexpected_invoice",
    message: string,
  ) {
    super(message);
    this.name = "IssuerError";
  }
}

export function hederaIssuer(opts: { market: Address; privateKey: Hex; rpcUrl?: string }): InvoiceIssuer {
  const rpcUrl = opts.rpcUrl ?? hederaTestnet.rpcUrl;
  const account = privateKeyToAccount(opts.privateKey);
  const wallet = createWalletClient({ account, chain: hedera, transport: http(rpcUrl) });
  const client = createPublicClient({ chain: hedera, transport: http(rpcUrl) });
  const reader = hederaReader(opts.market, rpcUrl);

  return {
    async createInvoice(args) {
      // simulate first: it returns the id this call will get and surfaces a revert before any gas is spent
      const { request, result } = await client.simulateContract({
        account,
        address: opts.market,
        abi: marketAbi,
        functionName: "createInvoice",
        args: [args.buyerVault, args.faceAmount, args.price, args.dueDate, args.evidenceHash],
      });
      // Hedera's gas estimate can come out too low (a claim ran out of gas on testnet), so give the call twice the estimate, at least 100,000.
      const estimate = await client.estimateContractGas({
        account,
        address: opts.market,
        abi: marketAbi,
        functionName: "createInvoice",
        args: [args.buyerVault, args.faceAmount, args.price, args.dueDate, args.evidenceHash],
      });
      const txHash = await wallet.writeContract({ ...request, gas: estimate * 2n > 100_000n ? estimate * 2n : 100_000n });
      const receipt = await client.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== "success") throw new IssuerError("reverted", `createInvoice reverted: ${txHash}`);

      // another transaction could have taken the simulated id first: confirm the invoice at that id is ours
      const invoice = await reader.getInvoice(result);
      if (invoice.evidenceHash.toLowerCase() !== args.evidenceHash.toLowerCase() || invoice.supplier.toLowerCase() !== account.address.toLowerCase()) {
        throw new IssuerError("unexpected_invoice", `invoice ${result} is not the one this call created`);
      }
      return { id: result.toString(), invoice, txHash };
    },
  };
}
