export const hederaTestnet = {
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrl: "https://testnet.hashio.io/api",
  explorerUrl: "https://hashscan.io/testnet",
} as const;

export type Chain = typeof hederaTestnet;
