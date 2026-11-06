// Creates the HCS audit topic with a submit key and prints its id and HashScan link.
// Usage: bunx tsx --env-file=.env scripts/hcs-create-topic.ts
// Needs a FUNDED Hedera testnet account: HEDERA_ACCOUNT_ID (0.0.x) and HEDERA_PRIVATE_KEY (ECDSA hex or DER).
// Then put the printed id in .env as HCS_TOPIC_ID.
import { Client, PrivateKey, TopicCreateTransaction } from "@hashgraph/sdk";

const accountId = process.env.HEDERA_ACCOUNT_ID;
const keyText = process.env.HEDERA_PRIVATE_KEY;
if (!accountId || !keyText) throw new Error("Missing env: HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY");

let key: PrivateKey;
try {
  key = PrivateKey.fromStringECDSA(keyText.replace(/^0x/, ""));
} catch {
  key = PrivateKey.fromString(keyText);
}
const client = Client.forTestnet().setOperator(accountId, key);

const tx = await new TopicCreateTransaction().setTopicMemo("AgentInvoice audit log").setSubmitKey(key.publicKey).execute(client);
const receipt = await tx.getReceipt(client);
const topicId = receipt.topicId?.toString();
if (!topicId) throw new Error("topic id missing from receipt");
console.log(`HCS topic created: ${topicId}`);
console.log(`HashScan: https://hashscan.io/testnet/topic/${topicId}`);
console.log(`Add to .env: HCS_TOPIC_ID=${topicId}`);
client.close();
