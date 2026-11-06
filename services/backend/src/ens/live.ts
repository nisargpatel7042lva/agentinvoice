import { createWalletClient, http, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { normalize, packetToBytes } from "viem/ens";
import { createPublicClient } from "viem";
import { sepoliaEnsReader } from "./read.js";
import type { PublisherDeps } from "./publisher.js";

const resolverAbi = [
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "bytes" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
] as const;

export interface LiveEnsOptions {
  name: string; // the agent subname, e.g. buyer.<parent>.eth
  resolver: Address; // the permissioned resolver instance
  publisherKey: Hex; // read from env by the caller; never logged
  rpcUrl?: string;
}

// Real Sepolia reads and writes for the publisher. Writes go through the permissioned resolver; the chain refuses any key
// this wallet does not hold the set-text role for, so even a bug here cannot touch limit or threshold.
export function liveEnsDeps(opts: LiveEnsOptions): Pick<PublisherDeps, "readText" | "writeText"> {
  const rpcUrl = opts.rpcUrl ?? (process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com");
  const reader = sepoliaEnsReader(rpcUrl);
  const account = privateKeyToAccount(opts.publisherKey);
  const wallet = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
  const dnsName = toHex(packetToBytes(normalize(opts.name)));

  return {
    readText: (key) => reader.getText(opts.name, key),
    writeText: async (key, value) => {
      const hash = await wallet.writeContract({ address: opts.resolver, abi: resolverAbi, functionName: "setText", args: [dnsName, key, value] });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`setText ${key} reverted`);
    },
  };
}
