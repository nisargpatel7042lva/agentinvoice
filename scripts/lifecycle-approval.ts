// Live test of the large-payment approval: an invoice above the vault's approval threshold must be refused without a signed
// approval, and accepted with a valid EIP-712 LargePayment signed by the vault's verifier. Run after scripts/deploy-contracts.ts.
//
//   bunx tsx --env-file=.env scripts/lifecycle-approval.ts
//
// Needs DEPLOYER_PRIVATE_KEY (the vault owner and agent) and SPONSOR_PRIVATE_KEY (the vault's verifier, the key that signs approvals).
// Face amount: LARGE_FACE_HBAR (default 60, above the 50 HBAR threshold and under the 500 HBAR daily limit). The vault is topped up
// for it; the money comes back through the claim, minus the discount and fees. UNITS: tinybars in the contracts, weibars on the wire.
import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, http, keccak256, toHex, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseUnits, tinybarToWeibar } from "../packages/shared/src/units.js";
import buyerVaultAbi from "../packages/shared/src/abi/BuyerVault.json" with { type: "json" };
import invoiceMarketAbi from "../packages/shared/src/abi/InvoiceMarket.json" with { type: "json" };
import addresses from "../packages/shared/src/addresses.json" with { type: "json" };

const rpcUrl = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api";
const target = process.env.DEPLOY_TARGET ?? "hedera";
const wire = (tinybar: bigint) => (target === "hedera" ? tinybarToWeibar(tinybar) : tinybar);
const link = (hash: Hex) => (target === "hedera" ? `https://hashscan.io/testnet/transaction/${hash}` : hash);
const chain = defineChain({
  id: Number(process.env.EXPECTED_CHAIN_ID ?? 296),
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

function key(name: string): Hex {
  const v = process.env[name];
  if (!v || !/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error(`Missing or invalid env: ${name}`);
  return v as Hex;
}

async function main() {
  const operator = privateKeyToAccount(key("DEPLOYER_PRIVATE_KEY"));
  const verifier = privateKeyToAccount(key("SPONSOR_PRIVATE_KEY"));
  const market = (process.env.MARKET_ADDRESS || addresses.invoiceMarket) as Address;
  const vault = (process.env.VAULT_ADDRESS || addresses.buyerVault) as Address;
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const wallet = createWalletClient({ account: operator, chain, transport: http(rpcUrl) });
  const gasPrice = await client.getGasPrice();
  const mAbi = invoiceMarketAbi as Abi;
  const vAbi = buyerVaultAbi as Abi;
  const read = <T>(address: Address, abi: Abi, functionName: string, fnArgs: unknown[] = []) => client.readContract({ address, abi, functionName, args: fnArgs }) as Promise<T>;

  const onchainVerifier = await read<Address>(vault, vAbi, "verifier");
  if (onchainVerifier.toLowerCase() !== verifier.address.toLowerCase()) throw new Error(`SPONSOR_PRIVATE_KEY is ${verifier.address} but the vault's verifier is ${onchainVerifier}`);
  const threshold = await read<bigint>(vault, vAbi, "approvalThreshold");
  const face = parseUnits(process.env.LARGE_FACE_HBAR ?? "60");
  const price = face - face / 20n;
  if (face <= threshold) throw new Error(`face ${face} is not above the approval threshold ${threshold}`);
  console.log(`vault ${vault}\nverifier ${verifier.address} (matches the vault)\nface ${face} tinybar > threshold ${threshold} tinybar`);

  // Hedera's gas estimate can be too low when a contract sends HBAR out: twice the estimate, at least 100,000.
  const send = async (label: string, address: Address, abi: Abi, functionName: string, fnArgs: unknown[], tinybarValue = 0n) => {
    const value = wire(tinybarValue);
    const estimate = await client.estimateContractGas({ account: operator, address, abi, functionName, args: fnArgs, value });
    const hash = await wallet.writeContract({ address, abi, functionName, args: fnArgs, value, gas: estimate * 2n > 100_000n ? estimate * 2n : 100_000n, type: "legacy", gasPrice });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== "success") throw new Error(`${label} reverted: ${link(hash)}`);
    console.log(`  ${label}: ${link(hash)}`);
  };

  console.log("\n[Setup]");
  if (!(await read<boolean>(vault, vAbi, "allowedMarket", [market]))) await send("vault.allowMarket", vault, vAbi, "allowMarket", [market, true]);
  if ((await read<bigint>(vault, vAbi, "supplierLimit", [operator.address])) < face) await send("vault.allowSupplier", vault, vAbi, "allowSupplier", [operator.address, face * 10n]);
  const balanceWire = await client.getBalance({ address: vault });
  if (balanceWire < wire(face)) await send("vault.deposit", vault, vAbi, "deposit", [], (wire(face) - balanceWire) / wire(1n) + 1n);

  const dueDate = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const evidence = keccak256(toHex(`large-${Date.now()}`));
  const id = (await client.simulateContract({ account: operator, address: market, abi: mAbi, functionName: "createInvoice", args: [vault, face, price, dueDate, evidence] })).result as bigint;
  console.log(`\n[1] create, accept and fund invoice #${id} (${face} tinybar face)`);
  await send("market.createInvoice", market, mAbi, "createInvoice", [vault, face, price, dueDate, evidence]);
  await send("vault.accept", vault, vAbi, "accept", [market, id]);
  await send(`market.fund (${price} tinybar)`, market, mAbi, "fund", [id], price);

  console.log("\n[2] repay WITHOUT an approval: the vault must refuse");
  try {
    await client.simulateContract({ account: operator, address: vault, abi: vAbi, functionName: "payInvoice", args: [market, id, "0x"] });
    throw new Error("UNEXPECTED: the vault accepted a large payment with no approval");
  } catch (err) {
    const msg = (err as { shortMessage?: string }).shortMessage ?? (err as Error).message;
    if (msg.startsWith("UNEXPECTED")) throw err;
    console.log(`  refused as expected: ${msg.split("\n")[0]}`);
  }

  console.log("\n[3] repay WITH the verifier's EIP-712 LargePayment approval");
  const nonce = BigInt(Date.now());
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 600);
  const signature = await verifier.signTypedData({
    domain: { name: "BuyerVault", version: "1", chainId: chain.id, verifyingContract: vault },
    types: {
      LargePayment: [
        { name: "vault", type: "address" },
        { name: "invoiceId", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "expiry", type: "uint256" },
      ],
    },
    primaryType: "LargePayment",
    message: { vault, invoiceId: id, amount: face, nonce, expiry },
  });
  const approval = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "bytes" }], [nonce, expiry, signature]);
  await send("vault.payInvoice (with approval)", vault, vAbi, "payInvoice", [market, id, approval]);
  if (!(await read<boolean>(vault, vAbi, "usedNonces", [nonce]))) throw new Error("the nonce was not consumed");
  console.log("  nonce consumed on-chain");

  console.log("\n[4] replaying the same approval must fail");
  try {
    await client.simulateContract({ account: operator, address: vault, abi: vAbi, functionName: "payInvoice", args: [market, id, approval] });
    throw new Error("UNEXPECTED: the vault accepted a replayed approval");
  } catch (err) {
    const msg = (err as { shortMessage?: string }).shortMessage ?? (err as Error).message;
    if (msg.startsWith("UNEXPECTED")) throw err;
    console.log(`  refused as expected: ${msg.split("\n")[0]}`);
  }

  await send("market.claim", market, mAbi, "claim", []);
  console.log("\n=== Large-payment approval verified on-chain ===");
}

main().catch((err) => {
  console.error(`\nFailed: ${(err as { shortMessage?: string }).shortMessage ?? (err as Error).message}`);
  process.exit(1);
});
