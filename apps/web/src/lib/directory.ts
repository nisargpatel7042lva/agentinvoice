// Who is who: display names for addresses. Mock mode uses this sample directory.
// Real mode: names come from ENS (reverse records), and unknown addresses fall back to a short hex.
import type { Address, Invoice } from "@invoiceagent/shared";

export type Role = "buyer" | "supplier" | "investor" | "sponsor";

export interface Party {
  address: Address;
  name: string;
  role: Role;
  /** Buyers only: the sponsor's address (the accountable human). */
  sponsor?: Address;
}

const P = (address: string, name: string, role: Role, sponsor?: string): Party => ({
  address: address.toLowerCase() as Address,
  name,
  role,
  sponsor: sponsor?.toLowerCase() as Address | undefined,
});

/** SAMPLE parties for demo mode. Not real people or companies. */
export const sampleParties: Party[] = [
  P("0x2222222222222222222222222222222222222222", "buyer-agent.eth", "buyer", "0xa11ce00000000000000000000000000000000001"),
  P("0x5555555555555555555555555555555555555555", "northwind-agent.eth", "buyer", "0xa11ce00000000000000000000000000000000002"),
  P("0x6666666666666666666666666666666666666666", "globex-agent.eth", "buyer", "0xa11ce00000000000000000000000000000000003"),
  P("0x7777777777777777777777777777777777777777", "initech-agent.eth", "buyer", "0xa11ce00000000000000000000000000000000004"),
  P("0xa11ce00000000000000000000000000000000001", "alice.eth", "sponsor"),
  P("0xa11ce00000000000000000000000000000000002", "ravi.eth", "sponsor"),
  P("0xa11ce00000000000000000000000000000000003", "meera.eth", "sponsor"),
  P("0xa11ce00000000000000000000000000000000004", "sam.eth", "sponsor"),
  P("0x1111111111111111111111111111111111111111", "acme-labelling.eth", "supplier"),
  P("0x1212121212121212121212121212121212121212", "pixel-studio.eth", "supplier"),
  P("0x1313131313131313131313131313131313131313", "cloudline-gpu.eth", "supplier"),
  P("0x1414141414141414141414141414141414141414", "dataforge.eth", "supplier"),
  P("0x3333333333333333333333333333333333333333", "orbit-capital.eth", "investor"),
  P("0x3434343434343434343434343434343434343434", "kai.eth", "investor"),
  P("0x3535353535353535353535353535353535353535", "lumen-fund.eth", "investor"),
];

const byAddress = new Map(sampleParties.map((p) => [p.address, p]));
export const partyOf = (a: string): Party | undefined => byAddress.get(a.toLowerCase() as Address);

const BOND = "0x4444444444444444444444444444444444444444" as Address;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const;
const HBAR = (n: number) => String(Math.round(n * 1e8));

type Seed = [id: number, supplier: string, buyer: string, face: number, price: number, due: number, status: Invoice["status"], holder?: string, desc?: string];

// Sample network invoices so the network has shape: an A buyer that pays, a B buyer, a C buyer that slips, a New buyer just starting.
const seeds: Seed[] = [
  [11, "0x1212", "0x2222", 40, 38, 1793100000, "Paid", "0x3333", "Brand illustrations, September"],
  [12, "0x1313", "0x2222", 120, 114, 1793300000, "Paid", "0x3333", "GPU hours, September"],
  [13, "0x1313", "0x2222", 90, 85.5, 1793500000, "Paid", "0x3434", "GPU hours, early October"],
  [14, "0x1111", "0x2222", 30, 28.5, 1794700000, "Funded", "0x3535", "Data labelling, October"],
  [15, "0x1414", "0x5555", 60, 56.4, 1793200000, "Paid", "0x3434", "Dataset licence"],
  [16, "0x1414", "0x5555", 75, 70.5, 1793600000, "Late", "0x3333", "Dataset refresh"],
  [17, "0x1212", "0x5555", 25, 23.5, 1794800000, "Open", undefined, "Pitch deck design"],
  [18, "0x1313", "0x5555", 150, 141, 1794900000, "Funded", "0x3535", "Inference cluster, November"],
  [19, "0x1111", "0x6666", 50, 46, 1792900000, "Defaulted", "0x3434", "Annotation batch 7"],
  [20, "0x1414", "0x6666", 35, 32.2, 1793400000, "Late", "0x3535", "Scraped corpus"],
  [21, "0x1212", "0x6666", 20, 18.4, 1794600000, "Open", undefined, "Landing page visuals"],
  [22, "0x1313", "0x6666", 80, 73.6, 1793000000, "Paid", "0x3333", "GPU hours, August"],
  [23, "0x1111", "0x7777", 15, 14.1, 1794950000, "Pending", undefined, "Pilot labelling job"],
  [24, "0x1414", "0x7777", 22, 20.6, 1795000000, "Open", undefined, "Starter dataset"],
  [25, "0x1212", "0x2222", 55, 52.3, 1795100000, "Open", undefined, "Product photography"],
  [26, "0x1313", "0x7777", 18, 16.9, 1795200000, "Pending", undefined, "Trial GPU hours"],
  [27, "0x1414", "0x5555", 50, 47.5, 1792500000, "Paid", undefined, "Dataset licence 2"],
  [28, "0x1414", "0x5555", 40, 38, 1792800000, "Paid", undefined, "Dataset licence 3"],
  [31, "0x1212", "0x2222", 10, 9.5, 1777000000, "Paid", undefined, "Historical job #1"],
  [32, "0x1212", "0x2222", 10, 9.5, 1778296000, "Paid", undefined, "Historical job #2"],
  [33, "0x1212", "0x2222", 10, 9.5, 1779592000, "Paid", undefined, "Historical job #3"],
  [34, "0x1212", "0x2222", 10, 9.5, 1780888000, "Paid", undefined, "Historical job #4"],
  [35, "0x1212", "0x2222", 10, 9.5, 1782184000, "Paid", undefined, "Historical job #5"],
  [36, "0x1212", "0x2222", 10, 9.5, 1783480000, "Paid", undefined, "Historical job #6"],
  [37, "0x1212", "0x2222", 10, 9.5, 1784776000, "Paid", undefined, "Historical job #7"],
  [38, "0x1212", "0x2222", 10, 9.5, 1786072000, "Paid", undefined, "Historical job #8"],
  [39, "0x1212", "0x2222", 10, 9.5, 1787368000, "Paid", undefined, "Historical job #9"],
  [40, "0x1212", "0x2222", 10, 9.5, 1788664000, "Paid", undefined, "Historical job #10"],
];

const full = (short: string) => sampleParties.find((p) => p.address.startsWith(short.toLowerCase()))!.address;

export const sampleNetworkInvoices: Invoice[] = seeds.map(([id, s, b, face, price, due, status, holder, desc]) => ({
  id: String(id),
  supplier: full(s),
  buyerVault: full(b),
  faceAmount: HBAR(face),
  price: HBAR(price),
  dueDate: due,
  status,
  bond: holder ? BOND : null,
  holder: holder ? full(holder) : null,
  evidenceHash: hash(id),
  description: desc ?? `Sample invoice #${id}`,
}));
