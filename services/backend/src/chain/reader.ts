import { hederaTestnet } from "@invoiceagent/shared";
import { createPublicClient, defineChain, http, parseAbi, type Address } from "viem";
import type { ChainInvoice, ChainReader } from "../indexer.js";

// getInvoice's struct follows the frozen spec v2 (packages/shared/spec.md section 1). UNVERIFIED against the deployed
// contract until Mann ships InvoiceMarket; if the struct changes, only this ABI needs to change.
export const marketAbi = parseAbi([
  "function createInvoice(address buyerVault, uint256 faceAmount, uint256 price, uint64 dueDate, bytes32 evidenceHash) returns (uint256 id)",
  "function getInvoice(uint256 id) view returns ((uint256 id, address supplier, address buyerVault, uint256 faceAmount, uint256 price, uint64 dueDate, uint8 status, address bond, address holder, bytes32 evidenceHash))",
]);

export const hedera = defineChain({
  id: hederaTestnet.id,
  name: hederaTestnet.name,
  nativeCurrency: hederaTestnet.nativeCurrency,
  rpcUrls: { default: { http: [hederaTestnet.rpcUrl] } },
});

export function hederaReader(market: Address, rpcUrl: string = hederaTestnet.rpcUrl): ChainReader {
  const client = createPublicClient({ chain: hedera, transport: http(rpcUrl) });
  return {
    getBlockNumber: () => client.getBlockNumber(),
    getLogs: async (fromBlock, toBlock) => {
      const logs = await client.getLogs({ address: market, fromBlock, toBlock });
      return logs.map((l) => ({
        txHash: l.transactionHash,
        logIndex: l.logIndex,
        blockNumber: l.blockNumber,
        topics: l.topics,
        data: l.data,
      }));
    },
    getInvoice: async (id): Promise<ChainInvoice> => {
      const inv = await client.readContract({ address: market, abi: marketAbi, functionName: "getInvoice", args: [id] });
      return {
        supplier: inv.supplier,
        buyerVault: inv.buyerVault,
        faceAmount: inv.faceAmount,
        price: inv.price,
        dueDate: BigInt(inv.dueDate),
        status: inv.status,
        bond: inv.bond,
        holder: inv.holder,
        evidenceHash: inv.evidenceHash,
      };
    },
  };
}
