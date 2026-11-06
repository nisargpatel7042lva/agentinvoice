# Copy

Every on-screen string, written once. The code imports `apps/web/src/lib/copy.ts`, which mirrors this file key for key. Plain English, sentence case, no exclamation marks, no crypto slang ("gm", "moon", "degen").

## Global
| Key | Text |
| --- | --- |
| `banner.testnet` | Testnet prototype. Not financial advice. |
| `banner.cached` | Some values on this page are cached from our server and may be a few minutes old. |
| `nav.brand` | Invoice Agent |
| `nav.market` | Marketplace |
| `nav.supplier` | Create invoice |
| `nav.back_market` | Back to marketplace |
| `wallet.connect` | Connect wallet |
| `wallet.connected` | Connected as {address} |
| `wallet.connect_to_fund` | Connect a wallet to fund this invoice |
| `money.where` | Where the money is |
| `sponsor.accountable` | Sponsor (accountable for this buyer) |

## Marketplace
| Key | Text |
| --- | --- |
| `market.title` | Invoices open for funding |
| `market.subtitle` | Buy an invoice at a discount. The buyer repays the full amount to you on the due date. |
| `market.filter_all` | All statuses |
| `market.col.invoice` · `.buyer` · `.sponsor` · `.face` · `.price` · `.due` · `.score` · `.status` | Invoice · Buyer · Sponsor · Face amount · Price · Due · Score · Status |
| `empty.market` | No invoices are open right now. New ones appear here as soon as a buyer accepts them. |

## Invoice detail
| Key | Text |
| --- | --- |
| `invoice.title` | Invoice #{id} |
| `invoice.face` | Face amount |
| `invoice.price` | Price |
| `invoice.discount` | Discount |
| `invoice.due` | Due |
| `invoice.supplier` | Supplier |
| `invoice.buyer` | Buyer |
| `invoice.holder` | Holder |
| `invoice.holder_none` | Not funded yet |
| `invoice.evidence` | Evidence hash |
| `invoice.evidence_help` | A fingerprint of the supplier's documents. The documents themselves stay private. |
| `invoice.fund` | Fund invoice for {price} |
| `invoice.history` | History |
| `empty.history` | Nothing has happened to this invoice yet. |

### Status explanations (`invoice.status_help.*`, also the StatusBadge tooltip)
| Status | Text |
| --- | --- |
| Pending | Waiting for the buyer to accept this invoice. It cannot be funded yet. |
| Open | The buyer has accepted this invoice. Anyone can fund it at the listed price. |
| Funded | An investor has paid the supplier. The buyer repays the investor on the due date. |
| Paid | The buyer has repaid the full amount to the investor. |
| Late | The due date has passed and the buyer has not paid yet. |
| Defaulted | The buyer did not pay. The sponsor's public record shows this. |

### Score bands (`score.help.*`)
| Band | Text |
| --- | --- |
| A | Strong record of paying on time. |
| B | Mostly on time. |
| C | Often late. Our investor agent skips these by default. |
| New | Not enough history to score yet. |

## Supplier
| Key | Text |
| --- | --- |
| `supplier.title` | Create an invoice |
| `supplier.buyer_label` | Buyer's ENS name |
| `supplier.buyer_placeholder` | buyer-name.eth |
| `supplier.resolving` | Looking up this name… |
| `supplier.resolved` | Pays from vault {vault} |
| `supplier.allowed` | You are on this buyer's allowed list (limit {limit}). |
| `supplier.not_allowed` | You are not on this buyer's allowed list yet. Ask the sponsor to add you. |
| `supplier.buyer_not_active` | This buyer is {status}, so new invoices are paused. |
| `supplier.face_label` | Face amount |
| `supplier.price_label` | Price you will receive now |
| `supplier.due_label` | Due date |
| `supplier.description_label` | What is this invoice for? |
| `supplier.evidence_label` | Supporting document |
| `supplier.evidence_help` | We store only a fingerprint (hash). The file stays on your device. |
| `supplier.submit` | Create invoice |
| `supplier.created` | Invoice created. It is Pending until the buyer accepts it. |

## Agent profile
| Key | Text |
| --- | --- |
| `agent.spent_today` | Spent today |
| `policy.title` | Spending policy |
| `policy.daily_limit` | Daily limit |
| `policy.threshold` | Needs sponsor approval above |
| `policy.suppliers` | Allowed suppliers |
| `policy.per_call_cap` | Max per paid request |
| `policy.hosts` | Allowed services |
| `ens.title` | Live from ENS |
| `ens.addr` | Pays from |
| `ens.addr_match` | Matches the vault on-chain |
| `ens.addr_mismatch` | Does not match the vault on-chain. Do not fund until this is fixed. |
| `ens.expires` | Name expires |
| `ens.set_by_sponsor` | Set by the sponsor |
| `ens.set_by_publisher` | Set by the publisher |
| `ens.set_by_registry` | From the ENS registry |
| `ens.permissions_title` | Who can change what |
| `ens.unreachable` | We cannot reach ENS right now, so these values are hidden rather than guessed. Try again in a minute. |
| `ens.missing` | This name has no Invoice Agent records yet. |
| `ens.expired` | This ENS name has expired. Treat this agent as unverified. |
| `ens.revoked` | This agent's name was revoked by its sponsor. Do not fund new invoices for it. |
| `empty.agent_history` | This buyer has no invoices yet. |

## Sponsor approval
| Key | Text |
| --- | --- |
| `approval.title` | Approve a payment |
| `approval.summary` | {agent} wants to pay invoice #{id}: {amount} |
| `approval.reason` | This is above your approval threshold of {threshold}. |
| `approval.approve` | Approve with World ID |
| `approval.reject` | Reject |
| `approval.reject_confirm` | Reject this payment? The agent will not pay this invoice. |
| `approval.world_help` | World ID proves a real person approved this, without sharing who you are. |
| `approval.approved` | Approved. The agent can now pay this invoice. |
| `approval.rejected` | Rejected. The agent will not pay this invoice. |
| `approval.expired` | This request expired. The agent will ask again if it still needs to pay. |

## Toasts and errors
| Key | Text |
| --- | --- |
| `toast.pending` | Waiting for the network to confirm… |
| `toast.success` | Done. View transaction |
| `error.generic` | Something went wrong. Nothing was charged. Please try again. |
| `error.rejected_wallet` | You cancelled in your wallet. Nothing was sent. |
| `error.insufficient` | Your wallet does not have enough HBAR for this. |
| `error.ens_not_found` | We could not find this ENS name. Check the spelling. |
| `error.backend_down` | Our server is not responding. Chain data is still live. |
| `error.not_found` | We could not find this invoice. |

## Onboarding and plain-language layer (added 2026-11-06)
Principle: each screen leads with **one action**; everything else sits in a closed section people can open. Jargon gets a `?` explanation instead of being avoided.

| Key | Text |
| --- | --- |
| `market.title` | Fund an invoice, get paid back more |
| `market.subtitle` | Pay a supplier now. The buyer pays you the full amount on the due date. |
| `onboarding.title` | New here? It takes three steps |
| `onboarding.steps` | Pick an invoice · Pay the supplier now · Get paid back (see copy.ts for the body lines) |
| `deal.youPay` / `deal.youGet` / `deal.return` | You pay now · You get back · Your return |
| `glossary.score` | How reliably this buyer has paid before. A is best, New means no history yet. |
| `glossary.sponsor` | The real person, verified with World ID, who is responsible for this buyer agent. |
| `glossary.ens` | A public name like buyer.eth. It shows who the agent is and its limits, and anyone can check it. |
| `glossary.agent` | Software that buys and pays invoices on someone's behalf, within limits set by its sponsor. |
| `sections.*` | Who's involved · Buyer's track record · Where the money is · Activity · Who can change these values |

## Credit score (added 2026-11-06)
| Key | Text |
| --- | --- |
| `creditScore.title` | Credit score |
| `creditScore.scale` | 300–900 |
| `creditScore.minScoreFilter` | Minimum score |
| `creditScore.filterAny` | Any score |
| `creditScore.filter650` | 650+ (Good) |
| `creditScore.filter750` | 750+ (Excellent) |
| `creditScore.noScore` | — |
| `creditScore.newChip` | New |
| `creditScore.asOf` | As of {date} |
| `creditScore.points` | +{pts} pts |
| `creditScore.factors.*` | Payment history · Defaults & recency · Exposure vs limit · History length · Track record size |
| `creditScore.howItWorks.title` | How this score works |
| `creditScore.howItWorks.description` | The credit score ranges from 300 to 900 and is computed deterministically from on-chain invoice history. It is tamper-proof: every input is verified from smart contract events on Hedera, with zero off-chain opinion. |

