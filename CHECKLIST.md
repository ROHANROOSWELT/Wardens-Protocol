# Wardens Protocol Complete Implementation Checklist

## General & Documentation
- [ ] Initialize repository structure
- [ ] Create `README.md` with full spec, pitch, roadmap
- [ ] Create `PROOF.md` (no placeholders, real deploy/tx hashes)
- [ ] Create `accounts.md`
- [ ] Create `architecture.md`
- [ ] Create `LICENSE`
- [ ] Create `.gitignore` (ignore keys, env, pem)
- [ ] Create `ROADMAP.md`
- [ ] Create `docs/demo-script.md`
- [ ] Create `docs/contract-api.md`
- [ ] Create `docs/agent-api.md`
- [ ] Create `scripts/deploy.sh`
- [ ] Create `scripts/seed_demo.sh`
- [ ] Create `scripts/run_verification.sh`
- [ ] Create `scripts/run_challenge.sh`

## Phase 1: Qualification Round
- [ ] Mock Data Generation (`backend/src/data/invoices.json`, `registry.json`, `ledger.json`)
- [ ] `WardensCore` unified contract implementation
  - [ ] `lib.rs` / `types.rs`
  - [ ] `asset.rs` (create_asset, get_asset)
  - [ ] `agents.rs` (register_agent, post_bond, release_bond)
  - [ ] `scores.rs` (submit_score, get_current_score, get_score_history)
  - [ ] `challenges.rs` (open_challenge, resolve_challenge)
  - [ ] `vault.rs` (deposit_collateral, current_ltv, borrow, freeze_asset)
- [ ] Local tests for `WardensCore`
- [ ] Testnet deployment of `WardensCore`
- [ ] Node.js Backend Orchestrator
  - [ ] Express or FastAPI setup
  - [ ] `casperClient.ts` / `x402Client.ts` / `scoreEngine.ts` / `evidenceHasher.ts`
  - [ ] `/api/assets`, `/api/agents`, `/api/verify`, `/api/challenge`, `/api/dashboard`
- [ ] 5 Agents implementation (deterministic + LLM explanation)
  - [ ] Parser Agent
  - [ ] Fraud-Heuristic Agent
  - [ ] Registry Agent
  - [ ] Aggregator Agent
  - [ ] Challenger Agent
- [ ] x402 Integration on Verifier Endpoints (Fraud, Parser, Registry)
- [ ] Frontend Dashboard (Next.js + Tailwind)
  - [ ] Asset Health, Trust Score, Live LTV, Borrowing Status
  - [ ] Verifier Bonds, x402 Receipts, Open Challenges, Slash Events
  - [ ] Casper Transaction Timeline
- [ ] Real Testnet Wallets Setup & Funding (Admin, 5 Agents)
- [ ] End-to-End Test (Create -> Verify -> Borrow)
- [ ] End-to-End Test (Fraud -> Freeze)
- [ ] End-to-End Test (Challenge -> Slash)
- [ ] Finalize Phase 1 `PROOF.md` & Video Script

## Phase 2: Final Round (Fully On-Chain, No Mocks per User Request)
- [ ] Contract Splitting (AssetNoteRegistry, TrustScoreRegistry, BondVault, ChallengeCourt, LendingVault)
- [ ] Additional Contracts: `CovenantEngine`, `ReserveVault`, `PrivacyCommitmentStore`
- [ ] Update Backend/Agents for multi-contract setup
- [ ] Replace mocked local data with actual on-chain or realistic external queries (as strictly requested: "no values or nothing in the app should be mocked")
- [ ] Dynamic x402 price discovery per agent
- [ ] Multi-agent arbitration for `resolve_challenge`
- [ ] On-chain reputation-weighted challenger pricing
- [ ] Commit/Reveal evidence proofs using PrivacyCommitmentStore
- [ ] Finalize full Phase 2 deployment on Casper Testnet
- [ ] Update dashboard for Phase 2 flows
- [ ] Update `PROOF.md` for Phase 2 transactions
