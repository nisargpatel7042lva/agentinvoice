// Deploys InvoiceMarket and BuyerVault, reads everything back, and (with --smoke) runs a tiny real lifecycle as a post-deploy test.
//
//   Hedera testnet:  bunx tsx --env-file=.env scripts/deploy-contracts.ts --smoke
//   Local anvil:     DEPLOY_TARGET=local HEDERA_RPC_URL=http://127.0.0.1:8599 bunx tsx --env-file=.env scripts/deploy-contracts.ts --smoke
//
// Needs `forge build` in contracts/ first (it reads contracts/out). Env: DEPLOYER_PRIVATE_KEY (required, a funded Hedera ECDSA key),
// VERIFIER_ADDRESS (the address whose signatures approve large payments; defaults to SPONSOR_ADDRESS), OWNER_ADDRESS and AGENT_ADDRESS
// (default: the deployer), GRACE_PERIOD_SECONDS (86400), DAILY_LIMIT_HBAR (500), APPROVAL_THRESHOLD_HBAR (50), HEDERA_RPC_URL.
//
// UNITS: the contracts count tinybars (1 HBAR = 1e8) inside the EVM. Over Hedera's JSON-RPC a transaction value is 18-decimal
// weibars, so every value sent is tinybars * 1e10 (tinybarToWeibar). DEPLOY_TARGET=local (anvil) has no such conversion, so the
// scale there is 1: the local run only checks the script and the lifecycle logic, not Hedera's unit behavior. The smoke test on
// Hedera is what proves the units: `fund` only succeeds if msg.value equals the tinybar price inside the contract.
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, getAddress, http, keccak256, toHex, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const args = new Set(process.argv.slice(2));
const target = process.env.DEPLOY_TARGET ?? "hedera";
if (target !== "hedera" && target !== "local") throw new Error(`DEPLOY_TARGET must be "hedera" or "local", got "${target}"`);
const WIRE_SCALE = target === "hedera" ? 10n ** 10n : 1n; // tinybar -> value sent over JSON-RPC
const write = target === "hedera" || args.has("--write"); // a local dry run never touches packages/shared
const smoke = args.has("--smoke");

const rpcUrl = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api";
const expectedChainId = Number(process.env.EXPECTED_CHAIN_ID ?? 296);
const hashscan = "https://hashscan.io/testnet";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
const optionalAddress = (name: string, fallback: Address): Address => (process.env[name] ? getAddress(process.env[name] as string) : fallback);

const keyText = need("DEPLOYER_PRIVATE_KEY");
if (!/^0x[0-9a-fA-F]{64}$/.test(keyText)) throw new Error("DEPLOYER_PRIVATE_KEY must be 0x + 64 hex characters");
const account = privateKeyToAccount(keyText as Hex);

const owner = optionalAddress("OWNER_ADDRESS", account.address);
const agent = optionalAddress("AGENT_ADDRESS", account.address);
const verifier = getAddress(process.env.VERIFIER_ADDRESS || need("SPONSOR_ADDRESS"));
const grace = BigInt(process.env.GRACE_PERIOD_SECONDS ?? 86_400);
const TINYBAR_PER_HBAR = 10n ** 8n;
const dailyLimit = BigInt(process.env.DAILY_LIMIT_HBAR ?? 500) * TINYBAR_PER_HBAR;
const approvalThreshold = BigInt(process.env.APPROVAL_THRESHOLD_HBAR ?? 50) * TINYBAR_PER_HBAR;

const chain = defineChain({
  id: expectedChainId,
  name: target === "hedera" ? "Hedera Testnet" : "Local",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const client = createPublicClient({ chain, transport: http(rpcUrl) });
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const path = new URL(`../contracts/out/${name}.sol/${name}.json`, import.meta.url);
  const json = JSON.parse(readFileSync(path, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
  if (!json.bytecode?.object || json.bytecode.object === "0x") throw new Error(`No bytecode for ${name}: run forge build in contracts/`);
  return { abi: json.abi, bytecode: json.bytecode.object };
}

let gasPrice: bigint;
async function send(label: string, hash: Hex) {
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hashscan}/transaction/${hash}`);
  console.log(`  ${label}: ${target === "hedera" ? `${hashscan}/transaction/${hash}` : hash}`);
  return receipt;
}

async function main() {
  const chainId = await client.getChainId();
  if (chainId !== expectedChainId) throw new Error(`Connected to chain ${chainId}, expected ${expectedChainId}. Check HEDERA_RPC_URL.`);
  gasPrice = await client.getGasPrice();
  const balance = await client.getBalance({ address: account.address }); // weibar on Hedera
  console.log(`target ${target}, chain ${chainId}, deployer ${account.address}`);
  console.log(`deployer balance: ${Number(balance) / 1e18} HBAR (JSON-RPC reports weibar), gas price ${gasPrice} wei`);
  if (balance === 0n) throw new Error("The deployer has no HBAR. Fund it (Hedera portal faucet) and run again.");
  if (target === "hedera" && balance < 10n * 10n ** 18n) console.log("  WARNING: under 10 HBAR; a deploy plus smoke test may run out");
  console.log(`owner ${owner}, agent ${agent}, verifier ${verifier}`);
  console.log(`daily limit ${dailyLimit} tinybar, approval threshold ${approvalThreshold} tinybar, grace ${grace}s`);

  const txFee = { type: "legacy" as const, gasPrice };
  const marketArt = artifact("InvoiceMarket");
  const vaultArt = artifact("BuyerVault");

  console.log("\n1. deploy");
  const marketReceipt = await send("InvoiceMarket", await wallet.deployContract({ abi: marketArt.abi, bytecode: marketArt.bytecode, args: [grace], ...txFee }));
  const market = marketReceipt.contractAddress as Address;
  const vaultReceipt = await send(
    "BuyerVault",
    await wallet.deployContract({ abi: vaultArt.abi, bytecode: vaultArt.bytecode, args: [owner, agent, verifier, dailyLimit, approvalThreshold], ...txFee }),
  );
  const vault = vaultReceipt.contractAddress as Address;
  console.log(`  InvoiceMarket ${market}\n  BuyerVault    ${vault}`);

  console.log("\n2. read everything back");
  for (const [name, address] of [["InvoiceMarket", market], ["BuyerVault", vault]] as const) {
    const code = await client.getCode({ address });
    if (!code || code === "0x") throw new Error(`${name} has no code at ${address}`);
    console.log(`  ${name} code: ${(code.length - 2) / 2} bytes at ${target === "hedera" ? `${hashscan}/contract/${address}` : address}`);
  }
  const read = <T>(address: Address, abi: Abi, functionName: string, fnArgs: unknown[] = []) => client.readContract({ address, abi, functionName, args: fnArgs }) as Promise<T>;
  const check = (what: string, got: unknown, want: unknown) => {
    const ok = typeof got === "string" && typeof want === "string" ? got.toLowerCase() === want.toLowerCase() : got === want;
    if (!ok) throw new Error(`${what}: got ${String(got)}, expected ${String(want)}`);
    console.log(`  ok  ${what} = ${String(got)}`);
  };
  check("market.owner", await read(market, marketArt.abi, "owner"), account.address);
  check("market.gracePeriod", BigInt(await read<bigint>(market, marketArt.abi, "gracePeriod")), grace);
  check("market.nextInvoiceId", await read(market, marketArt.abi, "nextInvoiceId"), 1n);
  check("vault.owner", await read(vault, vaultArt.abi, "owner"), owner);
  check("vault.agent", await read(vault, vaultArt.abi, "agent"), agent);
  check("vault.verifier", await read(vault, vaultArt.abi, "verifier"), verifier);
  check("vault.dailyLimit", await read(vault, vaultArt.abi, "dailyLimit"), dailyLimit);
  check("vault.approvalThreshold", await read(vault, vaultArt.abi, "approvalThreshold"), approvalThreshold);

  console.log("\n3. wire the vault to the market (the vault only calls markets its owner allowed)");
  if (owner.toLowerCase() === account.address.toLowerCase()) {
    await send("vault.allowMarket", await wallet.writeContract({ address: vault, abi: vaultArt.abi, functionName: "allowMarket", args: [market, true], ...txFee }));
    check("vault.allowedMarket(market)", await read(vault, vaultArt.abi, "allowedMarket", [market]), true);
  } else {
    console.log(`  SKIPPED: the owner is ${owner}, not the deployer. The owner must call vault.allowMarket(${market}, true) before any invoice is accepted.`);
  }

  if (write) {
    const dir = new URL("../packages/shared/src/", import.meta.url);
    writeFileSync(new URL("abi/InvoiceMarket.json", dir), `${JSON.stringify(marketArt.abi, null, 2)}\n`);
    writeFileSync(new URL("abi/BuyerVault.json", dir), `${JSON.stringify(vaultArt.abi, null, 2)}\n`);
    writeFileSync(
      new URL("addresses.json", dir),
      `${JSON.stringify({ chainId, network: "hedera:testnet", invoiceMarket: market, buyerVault: vault, deployer: account.address, verifier, lastUpdated: new Date().toISOString() }, null, 2)}\n`,
    );
    console.log("\n  wrote packages/shared/src/addresses.json and abi/*.json");
  } else {
    console.log("\n  local dry run: packages/shared was not touched (add --write to change that)");
  }

  if (smoke) await smokeTest(market, vault, marketArt.abi, vaultArt.abi, txFee);

  console.log(`\nVerify the source on Sourcify (a separate step, needs network):\n  cd contracts && forge verify-contract ${market} src/InvoiceMarket.sol:InvoiceMarket --chain 296 --verifier sourcify --constructor-args $(cast abi-encode "constructor(uint64)" ${grace})`);
  console.log("Done.");
}

// A tiny real lifecycle: deposit, allow a supplier, create an invoice, accept it through the vault, fund it, repay it, claim it.
// Amounts are a few thousand tinybars (a fraction of a cent). It needs owner = agent = deployer.
async function smokeTest(market: Address, vault: Address, marketAbi: Abi, vaultAbi: Abi, txFee: { type: "legacy"; gasPrice: bigint }) {
  console.log("\n4. post-deploy smoke test (a real lifecycle with tiny amounts)");
  if (owner.toLowerCase() !== account.address.toLowerCase() || agent.toLowerCase() !== account.address.toLowerCase()) {
    console.log("  SKIPPED: the smoke test needs owner = agent = deployer.");
    return;
  }
  const face = 2_000n; // tinybars
  const price = 1_900n;
  const deposit = 10_000n;
  const wire = (tinybar: bigint) => tinybar * WIRE_SCALE;
  const call = (address: Address, abi: Abi, functionName: string, fnArgs: unknown[], tinybarValue = 0n) =>
    wallet.writeContract({ address, abi, functionName, args: fnArgs, value: wire(tinybarValue), ...txFee });
  const status = async (id: bigint) => ((await client.readContract({ address: market, abi: marketAbi, functionName: "getInvoice", args: [id] })) as { status: number }).status;

  await send("vault.deposit", await call(vault, vaultAbi, "deposit", [], deposit));
  await send("vault.allowSupplier(deployer)", await call(vault, vaultAbi, "allowSupplier", [account.address, 1_000_000n]));
  const due = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const evidence = keccak256(toHex(`smoke-${Date.now()}`));
  const id = (await client.simulateContract({ account, address: market, abi: marketAbi, functionName: "createInvoice", args: [vault, face, price, due, evidence] })).result as bigint;
  await send("market.createInvoice", await call(market, marketAbi, "createInvoice", [vault, face, price, due, evidence]));
  await send("vault.accept", await call(vault, vaultAbi, "accept", [market, id]));
  if ((await status(id)) !== 1) throw new Error("invoice is not Open after accept");
  // THE UNITS PROOF: this only succeeds if msg.value inside the contract equals the tinybar price.
  await send(`market.fund (value = ${price} tinybar)`, await call(market, marketAbi, "fund", [id], price));
  if ((await status(id)) !== 2) throw new Error("invoice is not Funded after fund");
  await send("vault.payInvoice (no approval: face is under the threshold)", await call(vault, vaultAbi, "payInvoice", [market, id]));
  if ((await status(id)) !== 3) throw new Error("invoice is not Paid after payInvoice");
  const before = await client.getBalance({ address: account.address });
  await send("market.claim", await call(market, marketAbi, "claim", []));
  const claimable = (await client.readContract({ address: market, abi: marketAbi, functionName: "claimable", args: [account.address] })) as bigint;
  if (claimable !== 0n) throw new Error("claimable is not zero after claim");
  const after = await client.getBalance({ address: account.address });
  console.log(`  smoke test passed: invoice ${id} went Pending > Open > Funded > Paid and was claimed (balance change on claim: ${Number(after - before) / 1e18} HBAR incl. gas)`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${(err as { shortMessage?: string }).shortMessage ?? (err as Error).message}`);
  process.exit(1);
});
