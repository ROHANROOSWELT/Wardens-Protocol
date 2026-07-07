# Wardens Protocol — Full Setup & Replication Guide

This guide lets anyone reproduce Wardens Protocol on their own machine from scratch —
run the app locally, run/replace individual agents manually, and (optionally) deploy the
contract and run the whole loop on Casper Testnet themselves.

It's organized in three levels. Do only as much as you need:

- **Level 1 — Run the app locally (sim mode).** Only needs [Bun]. No blockchain, no keys.
- **Level 2 — Compile & test the smart contract.** Adds Rust + cargo-odra.
- **Level 3 — Deploy & run on Casper Testnet.** Adds the wasm toolchain + a funded wallet.

There is also an **already-live contract** on Casper Testnet you can inspect without
deploying anything:
`contract-package-75bf977a36437c2de44a4a74a3488c43ac6918b74f9f39c8a63c00e83b201af2`
(explorer: <https://testnet.cspr.live/contract-package/75bf977a36437c2de44a4a74a3488c43ac6918b74f9f39c8a63c00e83b201af2>).

---

## 0. Clone

```bash
git clone git@github.com:ChaseBP/warden-protocol.git
cd warden-protocol           # (the project root; called "repo root" below)
```

Repo layout:

```
contracts/wardens_core/   WardensCore Odra smart contract (+ livenet executor)
backend/                  Express/Bun orchestrator (REST API)
agents/                   parser · fraud · registry (x402 verifiers) · aggregator · challenger
dashboard/                Next.js one-page dashboard
scripts/                  demo + chain (testnet) scripts
```

---

## Level 1 — Run the app locally (sim mode)

Everything runs offline against an in-process mirror of the contract (`WARDENS_MODE=sim`,
the default). This is the fastest way to see the full loop.

### 1.1 Install Bun

```bash
curl -fsSL https://bun.sh/install | bash      # https://bun.sh
bun --version                                   # expect >= 1.3
```

### 1.2 Install backend dependencies

```bash
cd backend && bun install && cd ..
```
(The agents and dashboard need no install for a first run — agents use Bun's built-in
server; the dashboard install happens in step 1.6.)

### 1.3 Start the verifier agents + backend

**Option A — all at once:**
```bash
bash scripts/start_all.sh
```
This starts: parser agent `:4101`, fraud agent `:4102`, registry agent `:4103`, and the
backend orchestrator `:4000`.

**Option B — start each service manually** (one terminal each; this is how you'd run your
own agent — see §1.7):
```bash
# terminal 1 — parser verifier
cd agents/parser-agent   && PORT=4101 bun run src/index.ts
# terminal 2 — fraud verifier
cd agents/fraud-agent    && PORT=4102 bun run src/index.ts
# terminal 3 — registry verifier
cd agents/registry-agent && PORT=4103 bun run src/index.ts
# terminal 4 — backend orchestrator
cd backend && PORT=4000 WARDENS_MODE=sim bun run src/index.ts
```

Sanity check:
```bash
curl -s localhost:4000/health          # {"ok":true,"mode":"sim"}
curl -s localhost:4101/health          # {"ok":true,"agent":"parser-agent-1"}
```

### 1.4 Seed the demo and run the loop (scripts)

```bash
bash scripts/seed_demo.sh          # create 3 assets + register/bond aggregator & challenger
bash scripts/run_verification.sh   # INV-001 healthy -> borrow ; INV-002 duplicate -> freeze
bash scripts/run_challenge.sh      # INV-003 lying verifier -> challenged -> slashed
```

### 1.5 …or run the loop manually with `curl`

```bash
B=http://localhost:4000

# 1) create the healthy invoice
curl -s -X POST $B/api/assets -H 'Content-Type: application/json' \
  -d '{"asset_id":"INV-001","issuer":"ABC Traders","debtor":"RetailMart Ltd","face_value":1000,"due_date":1783728000}'

# 2) register + bond an aggregator agent (allowed to post scores)
curl -s -X POST $B/api/agents/register -H 'Content-Type: application/json' \
  -d '{"agent_id":"aggregator-agent-1","role":"Aggregator"}'
curl -s -X POST $B/api/agents/bond -H 'Content-Type: application/json' \
  -d '{"agent_id":"aggregator-agent-1","amount":10}'

# 3) run verification (backend pays parser/fraud/registry via x402, aggregates, posts score)
curl -s -X POST $B/api/verify -H 'Content-Type: application/json' -d '{"asset_id":"INV-001"}'

# 4) deposit collateral + borrow within LTV
curl -s -X POST $B/api/vault/deposit -H 'Content-Type: application/json' \
  -d '{"asset_id":"INV-001","collateral_value":1000}'
curl -s -X POST $B/api/vault/borrow  -H 'Content-Type: application/json' \
  -d '{"asset_id":"INV-001","amount":700}'

# 5) full dashboard state for the asset
curl -s $B/api/dashboard/INV-001
```

Fraud + challenge/slash (INV-002 / INV-003) follow the same pattern — see
`scripts/run_verification.sh` and `scripts/run_challenge.sh` for the exact bodies.

### 1.6 Dashboard

```bash
cd dashboard && bun install && bun run dev     # http://localhost:3000
```
The dashboard reads everything from the backend (`NEXT_PUBLIC_BACKEND_URL`, default
`http://localhost:4000`). Use the buttons to drive the same loop.

### 1.7 Run your OWN agent (x402 verifier)

Every verifier is a tiny Bun HTTP server built from one shared helper,
`agents/common.ts` → `serveVerifier(...)`. A minimal custom verifier:

```ts
// agents/my-agent/src/index.ts
import { serveVerifier, type VerifyResult } from "../../common.ts";

function verify(body: any): VerifyResult {
  // deterministic logic ONLY — no LLM for the score
  return { agent: "my-agent-1", valid: true, score: 88, findings: ["looks fine"] };
}

serveVerifier({
  port: Number(process.env.PORT ?? 4201),
  path: "/verify/custom",                 // your x402-gated endpoint
  agent: process.env.AGENT_ID ?? "my-agent-1",
  wallet: "casper-my-agent-wallet",       // advertised in the 402 response
  price: process.env.VERIFICATION_PRICE ?? "1000000",
  verify,
});
```
Run it: `cd agents/my-agent && PORT=4201 bun run src/index.ts`.
To make the backend orchestrator call your agent instead of a built-in one, point the
matching env var in `backend/.env` at it, e.g. `FRAUD_AGENT_URL=http://localhost:4201`.

**See the x402 handshake by hand** (any verifier endpoint):
```bash
# 1) unpaid request -> 402 with payment headers
curl -si -X POST localhost:4102/verify/fraud -H 'Content-Type: application/json' \
  -d '{"asset_id":"INV-002-DUPLICATE","invoice_number":"A-1001","amount":1000}'
#   HTTP/1.1 402 Payment Required
#   X-Payment-Amount: 1000000
#   X-Payment-Network: casper
#   X-Payment-Address: casper-fraud-agent-wallet

# 2) retry WITH a payment header -> result + receipt
curl -s -X POST localhost:4102/verify/fraud \
  -H 'Content-Type: application/json' \
  -H 'X-Payment: casper:my-payer:1000000:deadbeefsignature' \
  -d '{"asset_id":"INV-002-DUPLICATE","invoice_number":"A-1001","amount":1000}'
#   {"paid":true,"x402_receipt":"rcpt:...","score":0,"findings":[...]}
```

The **aggregator** and **challenger** agents are one-shot CLIs (not servers):
```bash
cd agents/aggregator-agent && bun run src/index.ts INV-001              # verifies + posts score
cd agents/challenger-agent && bun run src/index.ts INV-003-LYING-SCORE  # opens a challenge if suspicious
```

---

## Level 2 — Compile & test the smart contract

### 2.1 Install Rust + the Odra toolchain

```bash
# Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# wasm target + rust-src (rust-src is needed for the testnet build in Level 3)
rustup target add wasm32-unknown-unknown
rustup component add rust-src

# cargo-odra
cargo install cargo-odra --locked
```
> The contract pins a nightly toolchain via `contracts/wardens_core/rust-toolchain`
> (`nightly-2026-01-01`). rustup installs it automatically on first use. If prompted,
> add rust-src to that toolchain specifically:
> `rustup component add rust-src --toolchain nightly-2026-01-01`.

### 2.2 Run the contract test suite

```bash
cd contracts/wardens_core
cargo odra test           # expect: 12 passed; 0 failed
cd ../..
```

---

## Level 3 — Deploy & run on Casper Testnet yourself

Every step here is a **real, gas-costing transaction** signed by your funded key.

### 3.1 Extra tools for a Casper-compatible build

Casper's engine rejects wasm **bulk-memory** operations that modern Rust emits by default.
`scripts/build_wasm_mvp.sh` rebuilds the sysroot without them and normalizes the module to
strict MVP with `wasm-opt`, so you need:

```bash
# binaryen (provides wasm-opt)
sudo apt-get install binaryen          # OR download a release:
#   https://github.com/WebAssembly/binaryen/releases  (put ./bin/wasm-opt on PATH)

# wasm-tools (validates MVP compatibility)
cargo install wasm-tools

# (optional) casper-client, only for key generation / deploy inspection
```

### 3.2 Create and fund a wallet

Either use the **Casper Wallet browser extension** (create account, then in its settings
export the **secret key** as a `.pem`), or `casper-client keygen keys`.

Put the secret key at `keys/secret_key.pem` (this path is gitignored):
```bash
mkdir -p keys
# copy your exported secret_key.pem into keys/
```
Fund the account's public key from the faucet: <https://testnet.cspr.live/tools/faucet>
(request enough for ~1 deploy at 300–600 CSPR + ~15 calls at ~10 CSPR each; 5000 is plenty).

### 3.3 Configure the chain environment

```bash
cp scripts/chain.env.example scripts/chain.env
```
Edit `scripts/chain.env` (it is gitignored). The critical values (already verified working):
```bash
export ODRA_CASPER_LIVENET_NODE_ADDRESS="https://node.testnet.casper.network/rpc"
export ODRA_CASPER_LIVENET_CHAIN_NAME="casper-test"
# MUST be an ABSOLUTE path (scripts run from contracts/wardens_core):
export ODRA_CASPER_LIVENET_SECRET_KEY_PATH="$HOME/…/warden-protocol/keys/secret_key.pem"
# REQUIRED — the client waits on this SSE stream to confirm each tx:
export ODRA_CASPER_LIVENET_EVENTS_URL="https://node.testnet.casper.network/events"
export WARDENS_DEPLOY_GAS="600000000000"    # 600 CSPR
export WARDENS_GAS="10000000000"            # 10 CSPR per call
export WARDENS_CORE_ADDRESS=""              # set automatically by deploy_chain.sh
```

### 3.4 Deploy + run the full loop (scripts)

```bash
bash scripts/deploy_chain.sh              # builds MVP wasm if needed, deploys, saves the address
bash scripts/chain_create_asset.sh        # INV-001, INV-002-DUPLICATE, INV-003-LYING-SCORE
bash scripts/chain_register_agents.sh     # aggregator + challenger
bash scripts/chain_post_bonds.sh          # bond both agents
bash scripts/chain_verify_inv001.sh       # score 94 -> Healthy, LTV 75%
bash scripts/chain_borrow_inv001.sh       # deposit + borrow 700
bash scripts/chain_score_inv002_low.sh    # score 46 -> Frozen, LTV 0%
bash scripts/chain_score_inv003_bad_high.sh   # dishonest 90 (saves score id)
bash scripts/chain_open_challenge.sh      # challenger disputes it
bash scripts/chain_resolve_challenge.sh   # admin upholds -> verifier slashed, asset frozen
bash scripts/chain_read_state.sh          # prove final state on-chain
```
Each mutating script prints its transaction hash and a `testnet.cspr.live` link — copy
those into `PROOF.md`. `CHAIN_RUNBOOK.md` maps each script to its PROOF.md row.

### 3.5 …or drive the contract manually (livenet executor)

The scripts are thin wrappers around one binary. Source your env, then call it directly:

```bash
source scripts/chain.env
cd contracts/wardens_core
R="cargo run --quiet --features livenet --bin wardens_livenet --"

$R deploy                                                     # prints CONTRACT_ADDRESS=...
export WARDENS_CORE_ADDRESS="contract-package-...."           # from the deploy output

$R create_asset INV-001 "ABC Traders" "RetailMart Ltd" 1000 1783728000 "sha256:evidence"
$R register_agent aggregator-agent-1 aggregator               # roles: parser|fraud|registry|aggregator|challenger
$R post_bond aggregator-agent-1 10
$R submit_score INV-001 94 aggregator-agent-1 "sha256:ev" "sha256:expl"   # prints SCORE_ID=...
$R deposit_collateral INV-001 1000
$R borrow INV-001 700
$R register_agent challenger-agent-1 challenger
$R post_bond challenger-agent-1 10
$R open_challenge <SCORE_ID> challenger-agent-1 "sha256:counter" 5        # prints CHALLENGE_ID=...
$R resolve_challenge <CHALLENGE_ID> true

# reads (each costs a little gas via the proxy caller)
$R get_asset INV-001
$R current_ltv INV-001
$R get_agent aggregator-agent-1
$R get_challenge <CHALLENGE_ID>
```

### 3.6 See LIVE testnet data on the dashboard

The backend can serve the dashboard from real on-chain state (`WARDENS_MODE=chain`).
Reads go through the deployed contract (Odra proxy caller), so they cost a little gas and
take ~a minute per asset — it's an **on-demand sync**, not an auto-poll.

```bash
# 1. start the backend in chain mode (must see ODRA_CASPER_LIVENET_* + the contract address)
source scripts/chain.env
cd backend && WARDENS_MODE=chain PORT=4000 bun run src/index.ts
#    (WARDENS_CORE_ADDRESS is picked up automatically from scripts/.chain_state)

# 2. start the dashboard (another terminal)
cd dashboard && bun run dev            # http://localhost:3000
```
On the dashboard you'll see a green **🟢 LIVE · Casper Testnet** badge linking to the
contract, and a **⛓ Sync from testnet** button. Click it (pick the asset first) to pull
that asset's real status/score/LTV and the agents' bond/slash state from the chain.

You can also drive it from the API directly:
```bash
curl -s -X POST localhost:4000/api/chain/sync/INV-001    # reads INV-001 live from chain
curl -s localhost:4000/api/dashboard/INV-001             # now returns the on-chain state
curl -s localhost:4000/api/chain/info                    # mode + contract + explorer link
```

---

## Environment variable reference

**`backend/.env`** (sim demo): `WARDENS_MODE` (`sim`|`chain`), `PORT`,
`PARSER_AGENT_URL`, `FRAUD_AGENT_URL`, `REGISTRY_AGENT_URL`.
**each agent**: `PORT`, `AGENT_ID`, `VERIFICATION_PRICE`.
**`dashboard/.env`**: `NEXT_PUBLIC_BACKEND_URL`.
**`scripts/chain.env`** (testnet): see §3.3 — `ODRA_CASPER_LIVENET_NODE_ADDRESS`,
`ODRA_CASPER_LIVENET_CHAIN_NAME`, `ODRA_CASPER_LIVENET_SECRET_KEY_PATH` (absolute!),
`ODRA_CASPER_LIVENET_EVENTS_URL`, `WARDENS_DEPLOY_GAS`, `WARDENS_GAS`, `WARDENS_CORE_ADDRESS`.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Bulk memory operations are not supported` on deploy | The wasm wasn't built strict-MVP. Run `bash scripts/build_wasm_mvp.sh` (needs binaryen + rust-src). `deploy_chain.sh` does this automatically. |
| Deploy hangs then `Timeout waiting for transaction` | `ODRA_CASPER_LIVENET_EVENTS_URL` is wrong/unreachable. Use `https://node.testnet.casper.network/events`. If RPC and SSE are on different nodes, use a cspr.cloud endpoint + `CSPR_CLOUD_AUTH_TOKEN`. |
| `EnvVariableNotSet(...)` | Missing `ODRA_CASPER_LIVENET_*` var — check `scripts/chain.env` is filled and sourced. |
| Key file "not found" during deploy | `ODRA_CASPER_LIVENET_SECRET_KEY_PATH` must be **absolute** (scripts run from `contracts/wardens_core`). |
| Deploy rejected for insufficient payment / call out of gas | Raise `WARDENS_DEPLOY_GAS` / `WARDENS_GAS` in `scripts/chain.env`. |
| `Port 4000 in use` | A previous run is still up: `pkill -f "bun run src/index.ts"`. |
| `cargo odra` not found | `cargo install cargo-odra --locked`. |
| `error: no rust-src` during Level 3 build | `rustup component add rust-src --toolchain nightly-2026-01-01`. |
| `verification failed … agent services running?` from `/api/verify` | The parser/fraud/registry agents (`:4101-4103`) aren't running — start them (§1.3). |

---

## What each mode proves

- **Sim mode (Level 1):** the complete loop + the real x402 402→pay→receipt handshake,
  offline, with deterministic pseudo tx hashes. Best for demos and development.
- **Chain mode (Level 3):** the same loop as **real Casper Testnet transactions**
  (create → score → borrow → freeze → challenge → slash), verifiable on the explorer.
  See `PROOF.md` for the reference run's hashes and `CHAIN_RUNBOOK.md` for deeper detail.
