import { atsBondAbi, atsFactoryAbi, hederaTestnet } from "@invoiceagent/shared";
import { createPublicClient, createWalletClient, decodeEventLog, defineChain, http, pad, parseAbi, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Hedera Asset Tokenization Studio (ATS) on testnet. Route T1b: when an investor funds an invoice, the backend issuer
// deploys a bond for that invoice and issues the units to the holder. The token is the investor's proof of the invoice.
// The market contract still pays the stored holder; this issuer step is trusted and disclosed (docs/notes/ats.md).

/** 0.0.N as an EVM address (Hedera "long zero" form). */
export const evmFromHederaId = (id: string): Address => {
  const num = id.split(".").pop();
  if (!num || !/^\d+$/.test(num)) throw new Error(`bad Hedera id: ${id}`);
  return pad(toHex(BigInt(num)), { size: 20 });
};

export const ATS_TESTNET = {
  resolver: evmFromHederaId("0.0.9212226"),
  factory: evmFromHederaId("0.0.9213391"),
  bondConfigId: "0x0000000000000000000000000000000000000000000000000000000000000002" as Hex,
};

// Role ids from the ATS contracts (constants/roles.sol).
export const ROLES = {
  admin: "0x0000000000000000000000000000000000000000000000000000000000000000",
  issuer: "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f",
  controller: "0xb4d2b850c3ed8a234d390d5c157bbb1824883213c335ffe2a0f0761bb168713e",
  freezeManager: "0x71ae38482e1ab1c28e767d64766d686215b490c8c1bd7dfe6b101525187c2155",
  kyc: "0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc",
  kycManager: "0xec811504e835acf29535b5b62307b08000468f0c61ca6163ed6f17a03629b91e",
  internalKycManager: "0xdd78fdcd1b38a5360405cef8d91e758ad0f42bf2ced681b803b3c2704b0a32a7",
  pauser: "0x3cb8b459fdb6e7dc3d2a2aa529e530f885d45e03584adb438423209c86a2731f",
} as const satisfies Record<string, Hex>;

/** A syntactically valid ISIN (ISO 6166: country, 9 alphanumerics, Luhn check digit). ATS refuses an empty one. For test bonds only, not a real security id. */
export function makeIsin(seed: bigint | number | string): string {
  const body = `IN${String(seed).toUpperCase().replace(/[^A-Z0-9]/g, "").padStart(9, "0").slice(-9)}`;
  const digits = [...body].map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55))).join("");
  let sum = 0;
  [...digits].reverse().forEach((d, i) => {
    let n = Number(d);
    if (i % 2 === 0) n *= 2;
    sum += Math.floor(n / 10) + (n % 10);
  });
  return body + String((10 - (sum % 10)) % 10);
}

const resolverAbi = parseAbi(["function getLatestVersionByConfiguration(bytes32 configId) view returns (uint256)"]);

const chain = defineChain({
  id: hederaTestnet.id,
  name: hederaTestnet.name,
  nativeCurrency: hederaTestnet.nativeCurrency,
  rpcUrls: { default: { http: [hederaTestnet.rpcUrl] } },
});

export interface AtsIssuer {
  address: Address;
  createBond(args: { name: string; symbol: string; isin: string; units: bigint; maturity: number }): Promise<Address>;
  grantKyc(bond: Address, investor: Address): Promise<Hex>;
  issue(bond: Address, holder: Address, units: bigint, data?: Hex): Promise<Hex>;
  balanceOf(bond: Address, holder: Address): Promise<bigint>;
  freeze(bond: Address, account: Address, frozen: boolean): Promise<Hex>;
  /** Burns the caller's own units (the issuer's, after the holder's units are moved back by the controller). */
  controllerRedeem(bond: Address, holder: Address, units: bigint): Promise<Hex>;
}

/** Twice the estimate, at least 100,000: Hedera under-estimates calls that move HBAR; deployments need far more. */
const gasFor = (estimate: bigint | null, floor: bigint) => (estimate === null ? floor : estimate * 2n > floor ? estimate * 2n : floor);

export function atsIssuer(privateKey: Hex, rpcUrl = hederaTestnet.rpcUrl): AtsIssuer {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const reader = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ account, chain, transport });

  /** Hedera needs a legacy gas price at or above its minimum; viem's default 1559 fee is too low. */
  const fee = async () => ({ type: "legacy" as const, gasPrice: await reader.getGasPrice() });

  async function send(address: Address, functionName: string, args: unknown[], floor = 100_000n): Promise<Hex> {
    const estimate = await reader.estimateContractGas({ address, abi: atsBondAbi, functionName, args, account }).catch(() => null);
    const hash = await wallet.writeContract({ address, abi: atsBondAbi, functionName, args, gas: gasFor(estimate, floor), ...(await fee()), chain });
    const receipt = await reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
    return hash;
  }

  return {
    address: account.address,

    async createBond({ name, symbol, isin, units, maturity }) {
      const version = await reader.readContract({ address: ATS_TESTNET.resolver, abi: resolverAbi, functionName: "getLatestVersionByConfiguration", args: [ATS_TESTNET.bondConfigId] });
      const me = [account.address];
      const now = Math.floor(Date.now() / 1000);
      const bondData = {
        security: {
          resolver: ATS_TESTNET.resolver,
          maxSupply: units,
          resolverProxyConfiguration: { key: ATS_TESTNET.bondConfigId, version },
          erc20MetadataInfo: { name, symbol, isin, decimals: 8 },
          rbacs: [ROLES.admin, ROLES.issuer, ROLES.controller, ROLES.freezeManager, ROLES.kyc, ROLES.kycManager, ROLES.internalKycManager, ROLES.pauser].map((role) => ({ role, members: me })),
          externalPauses: [],
          externalControlLists: [],
          externalKycLists: [],
          compliance: "0x0000000000000000000000000000000000000000",
          identityRegistry: "0x0000000000000000000000000000000000000000",
          arePartitionsProtected: false,
          isMultiPartition: false,
          isControllable: true,
          isWhiteList: false,
          clearingActive: false,
          internalKycActivated: true,
          erc20VotesActivated: false,
        },
        bondDetails: { currency: "0x484252", nominalValue: 1n, nominalValueDecimals: 8, startingDate: BigInt(now + 120), maturityDate: BigInt(Math.max(maturity, now + 3600)) },
        proceedRecipients: [],
        proceedRecipientsData: [],
      };
      const regulation = { regulationType: 1, regulationSubType: 0, additionalSecurityData: { countriesControlListType: false, listOfCountries: "", info: "" } };
      const args = [bondData, regulation] as const;
      const estimate = await reader.estimateContractGas({ address: ATS_TESTNET.factory, abi: atsFactoryAbi, functionName: "deployBond", args, account }).catch(() => null);
      const hash = await wallet.writeContract({ address: ATS_TESTNET.factory, abi: atsFactoryAbi, functionName: "deployBond", args, gas: gasFor(estimate, 10_000_000n), ...(await fee()), chain });
      const receipt = await reader.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`deployBond reverted (${hash})`);
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: atsFactoryAbi, data: log.data, topics: log.topics });
          if (ev.eventName === "BondDeployed") return (ev.args as unknown as { bondAddress: Address }).bondAddress;
        } catch {
          /* not the factory event */
        }
      }
      throw new Error(`deployBond succeeded but no BondDeployed event was found (${hash})`);
    },

    grantKyc: (bond, investor) => send(bond, "grantKyc", [investor, "invoiceagent", 0n, BigInt(2 ** 40), account.address]),
    issue: (bond, holder, units, data = "0x") => send(bond, "issue", [holder, units, data]),
    balanceOf: (bond, holder) => reader.readContract({ address: bond, abi: atsBondAbi, functionName: "balanceOf", args: [holder] }) as Promise<bigint>,
    freeze: (bond, who, frozen) => send(bond, "setAddressFrozen", [who, frozen]),
    controllerRedeem: (bond, holder, units) => send(bond, "controllerRedeem", [holder, units, "0x", "0x"]),
  };
}
