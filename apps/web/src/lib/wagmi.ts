import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { hederaTestnet as hedera } from "@agentinvoice/shared";

/** Hedera testnet as an EVM chain (chain id 296). The RPC can be overridden for a private relay. */
export const hederaTestnet = defineChain({
  id: hedera.id,
  name: hedera.name,
  nativeCurrency: hedera.nativeCurrency,
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_HEDERA_RPC_URL || hedera.rpcUrl] } },
  blockExplorers: { default: { name: "HashScan", url: hedera.explorerUrl } },
  testnet: true,
});

// Browser wallets (MetaMask, Rabby, Coinbase extension, HashPack's EVM mode…) through EIP-6963 discovery.
export const wagmiConfig = createConfig({
  chains: [hederaTestnet],
  connectors: [injected()],
  multiInjectedProviderDiscovery: true,
  transports: { [hederaTestnet.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
