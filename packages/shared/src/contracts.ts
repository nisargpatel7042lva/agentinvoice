import type { Abi, Address } from "viem";
import deployed from "./addresses.json";
import buyerVaultAbiJson from "./abi/BuyerVault.json";
import invoiceMarketAbiJson from "./abi/InvoiceMarket.json";
import atsFactoryAbiJson from "./abi/AtsFactory.json";
import atsBondAbiJson from "./abi/AtsBond.json";

/** Deployed contract addresses on Hedera testnet (written by Mann's deploy script). */
export const contracts = {
  chainId: deployed.chainId,
  invoiceMarket: deployed.invoiceMarket as Address,
  buyerVault: deployed.buyerVault as Address,
} as const;

export const invoiceMarketAbi = invoiceMarketAbiJson as Abi;
export const buyerVaultAbi = buyerVaultAbiJson as Abi;
/** Hedera Asset Tokenization Studio: the factory that deploys a bond, and the bond itself (subset of IAsset). */
export const atsFactoryAbi = atsFactoryAbiJson as Abi;
export const atsBondAbi = atsBondAbiJson as Abi;

const ZERO = /^0x0{40}$/i;
/** False until the deploy script has written real addresses. */
export const isDeployed = (a: string) => !ZERO.test(a);
