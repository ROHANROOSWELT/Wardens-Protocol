# Wardens Protocol — Testnet Accounts

## Live deployment (casper-test)

- **WardensCore contract package:** `contract-package-75bf977a36437c2de44a4a74a3488c43ac6918b74f9f39c8a63c00e83b201af2`
- **Admin / deployer account:** `entity-account-b569d04d8d3e99c7fc44679d0ae3d7a430a7b13282c04cdc4c1db885d6e38fd9`

For the Qualification demo, a single funded admin wallet signs every transaction (it is
initialized as the contract admin and, per Section 6.6, may call every entrypoint). The
per-agent wallets below are for the Final Round (per-agent signing) — the agents' roles
are tracked on-chain by the contract, not by separate signing keys yet.

Record **public keys only** here — never a secret key (Section 5.2).

| Role             | Account / public key |
| ---------------- | -------------------- |
| backend/admin    | `entity-account-b569d04d8d3e99c7fc44679d0ae3d7a430a7b13282c04cdc4c1db885d6e38fd9` |
| aggregator-agent | on-chain agent `aggregator-agent-1` (signed by admin in demo mode) |
| parser-agent     | off-chain x402 verifier (no on-chain signer in Phase 1) |
| fraud-agent      | off-chain x402 verifier (no on-chain signer in Phase 1) |
| registry-agent   | off-chain x402 verifier (no on-chain signer in Phase 1) |
| challenger-agent | on-chain agent `challenger-agent-1` (signed by admin in demo mode) |

> Secret keys live outside the repo and are referenced only via
> `BACKEND_PRIVATE_KEY_PATH` / `AGENT_WALLET_KEY` env vars. `.gitignore` excludes
> `.env`, `*.pem`, and `secret_key*` patterns.
