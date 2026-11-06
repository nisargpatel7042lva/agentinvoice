// Live check of the ATS bond path on Hedera testnet: deploy a bond, grant KYC, issue units, read the balance.
// Usage: bunx tsx --env-file=.env scripts/ats/create-bond.ts <investorAddress> [units]
import { atsIssuer, makeIsin } from "../../services/backend/src/bond/ats.js";

const key = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) throw new Error("Missing env: DEPLOYER_PRIVATE_KEY");
const investor = process.argv[2] as `0x${string}` | undefined;
if (!investor) throw new Error("Usage: create-bond.ts <investorAddress> [units]");
const units = BigInt(process.argv[3] ?? "100000000"); // tinybar: 1 HBAR

const ats = atsIssuer(key);
console.log("issuer", ats.address);
const bond = await ats.createBond({ name: "Invoice Agent test bond", symbol: "AINV", isin: makeIsin(Date.now()), units: units * 10n, maturity: Math.floor(Date.now() / 1000) + 3600 });
console.log("bond", bond, `https://hashscan.io/testnet/contract/${bond}`);
console.log("kyc", await ats.grantKyc(bond, investor));
console.log("issue", await ats.issue(bond, investor, units));
console.log("balance", await ats.balanceOf(bond, investor));
