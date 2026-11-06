# Draft: Hedera Agent Accounts early-access application

Where to send it:
- the form at https://hedera.com/agent-accounts/#early-access
- and/or email ai-studio@hashgraph.com

Fill in the [brackets] and send it from your own account. Don't paste private keys or secrets anywhere.

---

**Subject:** Early access request: Invoice Agent (agent-to-agent invoice settlement on Hedera)

Hi Hedera AI Studio team,

We're [TEAM NAME], building **Invoice Agent** at [HACKATHON NAME]. It's an invoice marketplace where AI buyer agents accept and pay invoices, investors fund them at a discount, and a World ID–verified human sponsor is accountable for each agent through its ENS name.

Your Agent Accounts launch lists invoice settlement as a use case, and our design already follows the same model. On Hedera testnet today we run a `BuyerVault` contract that gives each buyer agent:
- an owner-set daily cap and per-supplier limits (a recipient allowlist),
- a human approval step above a threshold (World ID step-up),
- an audit trail on Hedera Consensus Service,
- x402 pay-per-request credit-score lookups.

Our agents spend only through a single `AgentAccount` interface, so we can switch the buyer agent from our vault to Hedera Agent Accounts without changing the agent or the UI. We'd like to be a design partner on the limited testnet: integrate the Agentic Payment Services API (REST or MCP) and give feedback on the invoice-settlement flow.

- Contracts (Hedera testnet): InvoiceMarket `0xb41048c7369d33d4e396ccb2e95e974b95a06d8b`, BuyerVault `0xbc792de2be972434a996f222da426b590e858056`
- Repo: [PUBLIC REPO LINK, or "available on request"]
- Demo: [LIVE DEMO LINK]
- Contact: [NAME], [EMAIL]

Thanks,
[NAME]
