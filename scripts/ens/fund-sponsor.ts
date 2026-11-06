// Generates the sponsor wallet into .env (if missing) and funds it from the ens-publisher wallet.
// Usage: bun scripts/ens/fund-sponsor.ts [amountEth]   (default 0.05)
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { formatEther, parseEther } from "viem";
import { publicClient, saveEnv, txLink, walletFor } from "./lib.js";

if (!process.env.SPONSOR_PRIVATE_KEY) {
  const key = generatePrivateKey();
  saveEnv("SPONSOR_PRIVATE_KEY", key);
  saveEnv("SPONSOR_ADDRESS", privateKeyToAccount(key).address);
  console.log("Generated sponsor wallet into .env. Restart this script so it is loaded.");
  process.exit(0);
}

const sponsorAddress = privateKeyToAccount(process.env.SPONSOR_PRIVATE_KEY as `0x${string}`).address;
const target = parseEther(process.argv[2] ?? "0.05");
const balance = await publicClient.getBalance({ address: sponsorAddress });
console.log("sponsor", sponsorAddress, "balance", formatEther(balance), "ETH");
if (balance >= target) {
  console.log("Already funded.");
  process.exit(0);
}

const { client } = walletFor("ENS_PUBLISHER_KEY");
const hash = await client.sendTransaction({ to: sponsorAddress, value: target - balance });
await publicClient.waitForTransactionReceipt({ hash });
console.log("Funded:", txLink(hash));
