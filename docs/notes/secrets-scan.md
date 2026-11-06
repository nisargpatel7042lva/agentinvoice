# Secrets scan (2026-11-06)

Scope: every commit on all 19 refs (`git log --all -p`, added lines only), plus the working tree. gitleaks and trufflehog are not installed, so this is a pattern scan.

Findings: none.

- PEM private key blocks: 0.
- API key formats (OpenAI `sk-`, GitHub `ghp_`/`gho_`, AWS `AKIA`, Slack `xox*`, Google `AIza`, World `worldidp_client_secret_`): 0.
- Mnemonic-like lines: 0.
- `*_KEY=`, `SECRET=`, `TOKEN=` assignments with a value outside `.env.example`: 0.
- 64-hex values other than repeated-byte test values (such as `abab...` evidence hashes): 0.
- The local `.env` values for `ENS_PUBLISHER_KEY`, `SPONSOR_PRIVATE_KEY` and `AGENTKIT_AGENT_KEY` appear in 0 commits. `.env` is untracked and ignored. Keys that are not set locally (`WORLD_CLIENT_SECRET`, `HEDERA_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`) could not be checked this way; rerun this scan after they are added.

Nothing to rotate. Public wallet addresses (publisher, sponsor, agent) and the Sepolia contract addresses are in the notes on purpose.

Rerun before making the repo public, after anyone adds a new key to `.env`:
`git log --all -p | grep -E '^\+' | grep -E -- '-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}'`
