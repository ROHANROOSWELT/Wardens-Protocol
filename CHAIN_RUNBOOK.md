# Wardens Protocol — Casper Testnet Chain Runbook

This runbook deploys `WardensCore` to Casper Testnet and runs the full Phase‑1 loop
on-chain using the Odra **livenet** executor (`contracts/wardens_core/bin/livenet.rs`,
built with `--features livenet`). Every step is a real deploy signed by your funded key.

`sim` mode is unaffected — this is a separate path. Nothing here touches the dashboard.

---

## 1. Prerequisites

- Rust + `cargo-odra` and the pinned nightly (`contracts/wardens_core/rust-toolchain`),
  plus the `rust-src` component (`rustup component add rust-src`).
- **binaryen `wasm-opt`** and **`wasm-tools`** (`cargo install wasm-tools`) — required to
  build a Casper-compatible wasm. Casper's engine rejects wasm **bulk-memory** ops that
  modern Rust emits by default; `scripts/build_wasm_mvp.sh` rebuilds the sysroot with
  those features off (`-Z build-std`) and normalizes the module to strict MVP with
  `wasm-opt`. `scripts/deploy_chain.sh` runs this automatically if the wasm is missing or
  not MVP-valid.
- `casper-client` (optional — for key generation and deploy inspection).
- A Casper Testnet node RPC URL.

## 2. Required environment variables

The Odra livenet host reads these (exact names):

| Variable | Required | Example |
| -------- | -------- | ------- |
| `ODRA_CASPER_LIVENET_NODE_ADDRESS` | yes | `https://rpc.testnet.casperlabs.io/rpc` (any casper-test node RPC) |
| `ODRA_CASPER_LIVENET_CHAIN_NAME`   | yes | `casper-test` |
| `ODRA_CASPER_LIVENET_SECRET_KEY_PATH` | yes | **absolute** `/abs/path/keys/secret_key.pem` (relative paths break — scripts run from `contracts/wardens_core`) |
| `ODRA_CASPER_LIVENET_EVENTS_URL`   | **yes** | `https://node.testnet.casper.network/events` (the client waits on this SSE stream to confirm each tx) |
| `CSPR_CLOUD_AUTH_TOKEN`            | no  | only if your RPC is a cspr.cloud endpoint |
| `WARDENS_DEPLOY_GAS`               | no  | motes for deploy (default `300000000000` = 300 CSPR) |
| `WARDENS_GAS`                      | no  | motes per entrypoint call (default `10000000000` = 10 CSPR) |
| `WARDENS_CORE_ADDRESS`             | auto | set for you by `deploy_chain.sh` (saved to `scripts/.chain_state`) |

Put them in **`scripts/chain.env`** (gitignored) so every script picks them up:

```bash
# scripts/chain.env
export ODRA_CASPER_LIVENET_NODE_ADDRESS="https://node.testnet.casper.network/rpc"
export ODRA_CASPER_LIVENET_CHAIN_NAME="casper-test"
export ODRA_CASPER_LIVENET_SECRET_KEY_PATH="/absolute/path/to/wardens-protocol/keys/secret_key.pem"
export ODRA_CASPER_LIVENET_EVENTS_URL="https://node.testnet.casper.network/events"
```

## 3. Wallet / key files

Only **one** funded key is required (the admin/deployer — it is initialized as the
contract admin and, per Section 6.6, may call every entrypoint in demo mode):

```
keys/secret_key.pem      # referenced by ODRA_CASPER_LIVENET_SECRET_KEY_PATH
keys/public_key.pem
keys/public_key_hex
```

Generate:
```bash
mkdir -p keys && casper-client keygen keys
```
Get the account hash / public key hex for the faucet + accounts.md:
```bash
cat keys/public_key_hex
casper-client account-address --public-key keys/public_key.pem   # account-hash-…
```

## 4. Fund the admin wallet

Fund the admin **public key hex** from the Casper Testnet faucet:
https://testnet.cspr.live/tools/faucet — request enough for the deploy (~300 CSPR) plus
the ~11 entrypoint calls (~10 CSPR each). Record the public key in `accounts.md`
(public key only — never the secret key).

## 5. Exact command order

Run from the repo root:

```bash
# (optional) prove the logic locally first
cd contracts/wardens_core && cargo odra test && cd ../..

# 1. deploy — prints CONTRACT_ADDRESS and saves it to scripts/.chain_state
bash scripts/deploy_chain.sh

# 2. create the three demo assets
bash scripts/chain_create_asset.sh

# 3. register the on-chain agents (aggregator + challenger)
bash scripts/chain_register_agents.sh

# 4. bond both agents
bash scripts/chain_post_bonds.sh

# 5. INV-001: post trust score 94  (Healthy, LTV 75%)
bash scripts/chain_verify_inv001.sh

# 6. INV-001: deposit collateral + borrow 700  (succeeds)
bash scripts/chain_borrow_inv001.sh

# 7. INV-002-DUPLICATE: post fraud score 46  (Frozen, LTV 0%)
bash scripts/chain_score_inv002_low.sh

# 8. INV-003: dishonest verifier posts 90  (saves INV003_SCORE_ID)
bash scripts/chain_score_inv003_bad_high.sh

# 9. challenger opens a challenge  (saves CHALLENGE_ID)
bash scripts/chain_open_challenge.sh

# 10. admin upholds the challenge  (verifier slashed, INV-003 frozen)
bash scripts/chain_resolve_challenge.sh

# 11. read final state (proves slash + freeze)
bash scripts/chain_read_state.sh
```

## 6. Where each real hash goes in PROOF.md

Each mutating script triggers a deploy; the Odra livenet log prints a line with the
**deploy/transaction hash** and a `https://testnet.cspr.live/deploy/<hash>` link. Copy
those into the table in **PROOF.md → section 2** (do this yourself once you have real
output — I will not pre-fill it):

| PROOF.md row        | Comes from script                    |
| ------------------- | ------------------------------------ |
| Deploy WardensCore  | `deploy_chain.sh` (also CONTRACT_ADDRESS → "Contract hash") |
| Create INV-001      | `chain_create_asset.sh` (1st create) |
| Register Agent      | `chain_register_agents.sh`           |
| Post Bond           | `chain_post_bonds.sh`                |
| Submit Score        | `chain_verify_inv001.sh` (score 94)  |
| Borrow              | `chain_borrow_inv001.sh`             |
| Submit Bad Score    | `chain_score_inv002_low.sh` (46 / frozen) |
| Open Challenge      | `chain_open_challenge.sh`            |
| Resolve Challenge   | `chain_resolve_challenge.sh`         |

The contract address printed by step 1 also goes into `backend/.env`
(`WARDENS_CORE_HASH`), `dashboard/.env` (`NEXT_PUBLIC_WARDENS_CORE_HASH`), and
`accounts.md`.

## 7. How to verify each step succeeded

- **Deploy:** `deploy_chain.sh` prints `CONTRACT_ADDRESS=contract-package-…`. Optionally
  `casper-client get-deploy --node-address "$ODRA_CASPER_LIVENET_NODE_ADDRESS" <hash>`
  and confirm `"Success"`.
- **Score / LTV:** `chain_verify_inv001.sh` ends by printing
  `ASSET … status=Healthy score=94` and `LTV INV-001 = 75%`.
- **Borrow:** `chain_borrow_inv001.sh` prints `OK borrow INV-001 700` (a revert would
  abort the script).
- **Fraud freeze:** `chain_score_inv002_low.sh` prints `status=Frozen` and `LTV … = 0%`.
- **Slash + freeze:** after `chain_resolve_challenge.sh`, `chain_read_state.sh` shows
  `AGENT id=aggregator-agent-1 … slashed_count=1 active=false`,
  `ASSET id=INV-003-LYING-SCORE status=Frozen`, and `CHALLENGE … status=Upheld`.

## 8. Notes / remaining manual steps

- Odra prints deploy hashes in its INFO log — the scripts cannot invent them, so
  **you** copy them into PROOF.md from the live output.
- On-chain reads (`get_*`, `current_ltv`) use Odra's proxy caller and cost a little gas.
- If a call runs out of gas, bump `WARDENS_GAS` and re-run that step.
- Confirmed uncertainty: exact gas amounts and node behaviour can vary by node — adjust
  `WARDENS_GAS` / `WARDENS_DEPLOY_GAS` if a deploy is rejected for insufficient payment.
