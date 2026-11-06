// Runs one real invoice through the deployed contracts on Hedera testnet and prints every transaction.
//
//   happy path:  bunx tsx --env-file=.env scripts/lifecycle.ts
//   default path: bunx tsx --env-file=.env scripts/lifecycle.ts --default   (waits for the due date and the grace period)
//
// The operator (DEPLOYER_PRIVATE_KEY) plays supplier, investor and the vault's agent, and must be the vault's owner so it can set it up.
// Addresses come from packages/shared/src/addresses.json (written by scripts/deploy-contracts.ts) or MARKET_ADDRESS / VAULT_ADDRESS.
// Env: FACE_HBAR (default 1), DISCOUNT_BPS (500), DUE_IN_SECONDS (180), HEDERA_RPC_URL, DEPLOY_TARGET=local for anvil.
//
// UNITS: amounts in the contracts are tinybars (1 HBAR = 1e8). Over Hedera's JSON-RPC a value is weibars: tinybars * 1e10.
import { createPublicClient, createWalletClient, defineChain, formatEther, http, keccak256, toHex, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseUnits, tinybarToWeibar } from "../packages/shared/src/units.js";
import buyerVaultAbi from "../packages/shared/src/abi/BuyerVault.json" with { type: "json" };
import invoiceMarketAbi from "../packages/shared/src/abi/InvoiceMarket.json" with { type: "json" };
import addresses from "../packages/shared/src/addresses.json" with { type: "json" };

const isDefaultMode = process.argv.includes("--default") || process.argv.includes("--mode=default");
const target = process.env.DEPLOY_TARGET ?? "hedera";
const rpcUrl = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api";
const wire = (tinybar: bigint) => (target === "hedera" ? tinybarToWeibar(tinybar) : tinybar);
const link = (hash: Hex) => (target === "hedera" ? `https://hashscan.io/testnet/transaction/${hash}` : hash);

const chain = defineChain({
  id: Number(process.env.EXPECTED_CHAIN_ID ?? 296),
  name: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

const STATUS = ["Pending", "Open", "Funded", "Paid", "Late", "Defaulted"] as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`=== AgentInvoice lifecycle (${isDefaultMode ? "DEFAULT path" : "HAPPY path"}, ${target}) ===`);
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Missing or invalid env: DEPLOYER_PRIVATE_KEY");
  const account = privateKeyToAccount(key as Hex);
  const market = (process.env.MARKET_ADDRESS || addresses.invoiceMarket) as Address;
  const vault = (process.env.VAULT_ADDRESS || addresses.buyerVault) as Address;
  if (/^0x0+$/.test(market) || /^0x0+$/.test(vault)) throw new Error("No deployed addresses: run scripts/deploy-contracts.ts first (or set MARKET_ADDRESS and VAULT_ADDRESS)");

  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const gasPrice = await client.getGasPrice();
  const txFee = { type: "legacy" as const, gasPrice };
  const mAbi = invoiceMarketAbi as Abi;
  const vAbi = buyerVaultAbi as Abi;

  const faceTiny = parseUnits(process.env.FACE_HBAR ?? "1"); // tinybars
  const priceTiny = faceTiny - (faceTiny * BigInt(process.env.DISCOUNT_BPS ?? 500)) / 10_000n;
  const dueIn = Number(process.env.DUE_IN_SECONDS ?? 180);
  console.log(`operator ${account.address}\nmarket   ${market}\nvault    ${vault}`);
  console.log(`face ${faceTiny} tinybar, price ${priceTiny} tinybar, due in ${dueIn}s`);

  const read = <T>(address: Address, abi: Abi, functionName: string, fnArgs: unknown[] = []) => client.readContract({ address, abi, functionName, args: fnArgs }) as Promise<T>;
  const send = async (label: string, address: Address, abi: Abi, functionName: string, fnArgs: unknown[], tinybarValue = 0n) => {
    // Hedera's gas estimate can be too low when a contract sends HBAR out (claim ran out of gas on testnet): use twice the estimate, at least 100,000.
    const value = wire(tinybarValue);
    const estimate = await client.estimateContractGas({ account, address, abi, functionName, args: fnArgs, value });
    const hash = await wallet.writeContract({ address, abi, functionName, args: fnArgs, value, gas: estimate * 2n > 100_000n ? estimate * 2n : 100_000n, ...txFee });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== "success") throw new Error(`${label} reverted: ${link(hash)}`);
    console.log(`  ${label}: ${link(hash)}`);
  };
  const statusOf = async (id: bigint) => STATUS[((await read<{ status: number }>(market, mAbi, "getInvoice", [id])).status) as number];

  console.log("\n[Setup] the operator must own the vault, and the vault must trust this market and this supplier");
  const owner = await read<Address>(vault, vAbi, "owner");
  if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error(`The operator is not the vault owner (${owner}); use the owner key.`);
  if (!(await read<boolean>(vault, vAbi, "allowedMarket", [market]))) await send("vault.allowMarket", vault, vAbi, "allowMarket", [market, true]);
  // the supplier must be allowed AND its per-invoice limit must cover this invoice (an earlier run may have set a smaller limit)
  const supplierAllowed = await read<boolean>(vault, vAbi, "allowedSupplier", [account.address]);
  if (!supplierAllowed || (await read<bigint>(vault, vAbi, "supplierLimit", [account.address])) < faceTiny) {
    await send("vault.allowSupplier", vault, vAbi, "allowSupplier", [account.address, faceTiny * 10n]);
  }
  const vaultBalanceWire = await client.getBalance({ address: vault }); // JSON-RPC reports weibar
  const neededWire = wire(faceTiny);
  if (vaultBalanceWire < neededWire) await send("vault.deposit", vault, vAbi, "deposit", [], (neededWire - vaultBalanceWire) / wire(1n) + 1n);

  const dueDate = BigInt(Math.floor(Date.now() / 1000) + dueIn);
  const evidence = keccak256(toHex(`evidence-${Date.now()}`));
  const invoiceId = (await client.simulateContract({ account, address: market, abi: mAbi, functionName: "createInvoice", args: [vault, faceTiny, priceTiny, dueDate, evidence] })).result as bigint;

  console.log(`\n[1] create invoice #${invoiceId} (supplier -> Pending)`);
  await send("market.createInvoice", market, mAbi, "createInvoice", [vault, faceTiny, priceTiny, dueDate, evidence]);
  console.log("[2] the vault accepts it (Pending -> Open)");
  await send("vault.accept", vault, vAbi, "accept", [market, invoiceId]);
  console.log("[3] the investor funds it with the tinybar price (Open -> Funded); the supplier is paid at once");
  await send(`market.fund (${priceTiny} tinybar)`, market, mAbi, "fund", [invoiceId], priceTiny);
  console.log(`    status: ${await statusOf(invoiceId)}`);

  if (isDefaultMode) {
    const grace = await read<bigint>(market, mAbi, "gracePeriod");
    console.log(`\n[4] DEFAULT path: nobody repays. Waiting for the due date, then the ${grace}s grace period.`);
    if (grace > 600n) console.log(`    NOTE: the grace period is long (${grace}s). Redeploy with GRACE_PERIOD_SECONDS=60 for a demo.`);
    // The contract compares against the chain's block timestamp (consensus time), which can trail this machine's clock by seconds,
    // so wait on the latest block, not on Date.now().
    const chainTime = async () => (await client.getBlock({ blockTag: "latest" })).timestamp;
    const waitUntilAfter = async (t: bigint) => {
      while ((await chainTime()) <= t) await sleep(2000);
    };
    await waitUntilAfter(dueDate);
    await send("market.markLate", market, mAbi, "markLate", [invoiceId]);
    console.log(`    status: ${await statusOf(invoiceId)}`);
    await waitUntilAfter(dueDate + grace);
    await send("market.markDefaulted", market, mAbi, "markDefaulted", [invoiceId]);
    console.log(`    status: ${await statusOf(invoiceId)} (the investor takes the loss)`);
    console.log("\n=== Default lifecycle completed ===");
    return;
  }

  console.log("\n[4] the vault repays the face amount (Funded -> Paid)");
  await send("vault.payInvoice", vault, vAbi, "payInvoice", [market, invoiceId]);
  console.log(`    status: ${await statusOf(invoiceId)}`);
  console.log("[5] the investor claims the repayment");
  await send("market.claim", market, mAbi, "claim", []);

  console.log(`\nFinal operator balance: ${formatEther(await client.getBalance({ address: account.address }))} HBAR`);
  console.log("=== Happy path completed ===");
}

main().catch((err) => {
  console.error(`\nLifecycle failed: ${(err as { shortMessage?: string }).shortMessage ?? (err as Error).message}`);
  process.exit(1);
});
