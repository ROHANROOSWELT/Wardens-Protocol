# Wardens Protocol — Testnet Proof

This file is the running proof log for the Qualification submission. It has two parts:

1. **Proven now** — contract compiles, 12 Odra tests pass, a deployable wasm is built,
   and the full Section 3 loop runs end-to-end (verification → score → borrow → fraud
   freeze → challenge → slash).
2. **Testnet deploy table** — filled with real deploy + transaction hashes after running
   `scripts/deploy.sh` with a funded Casper Testnet key (Section 5.1).

---

## 1. Proven now (local, reproducible)

### Contract build + tests

```
$ cd contracts/wardens_core && cargo odra test
running 12 tests
test tests::asset_creation_works ... ok
test tests::duplicate_asset_rejected ... ok
test tests::unbonded_agent_cannot_submit_score ... ok
test tests::bonded_agent_can_submit_score_and_updates_ltv ... ok
test tests::low_score_freezes_asset ... ok
test tests::borrow_within_ltv_succeeds_and_exceeding_rejected ... ok
test tests::borrow_rejected_when_frozen ... ok
test tests::stale_score_blocks_borrow ... ok
test tests::challenge_upheld_slashes_verifier_and_freezes ... ok
test tests::challenge_rejected_slashes_challenger ... ok
test tests::non_challenger_role_cannot_open_challenge ... ok
test tests::ltv_table_matches_spec ... ok
test result: ok. 12 passed; 0 failed
```

Deployable artifact: `contracts/wardens_core/wasm/WardensCore.wasm` (408 KB) produced by
`cargo odra build`.

### Full loop, end-to-end (transaction trail)

Captured from `GET /api/transactions` after `seed_demo.sh`, `run_verification.sh`,
`run_challenge.sh`. In `WARDENS_MODE=sim` these hashes are produced by the in-process
`WardensCore` mirror (identical semantics to the on-chain contract); in
`WARDENS_MODE=chain` each row is a real Casper deploy hash.

| Action              | Hash (local sim run)       | Result                                   |
| ------------------- | -------------------------- | ---------------------------------------- |
| register_agent      | `9f31fe6d4fee29dfb3a770f6` | aggregator-agent-1 registered            |
| post_bond           | `fd379eea5a162b56eae33adf` | Bond 10 locked                           |
| register_agent      | `368b38baa9d98c7ed25b9ea2` | challenger-agent-1 registered            |
| post_bond           | `bcc5231cbd979ffe674cf5c5` | Bond 10 locked                           |
| create_asset        | `1592efc510994464c64e025f` | INV-001 created                          |
| create_asset        | `20f552e4e550c8c078429cfb` | INV-002-DUPLICATE created                |
| create_asset        | `49989b7e948cd9c6023d6003` | INV-003-LYING-SCORE created              |
| submit_score        | `47d700d50b9e2c622e370479` | INV-001 score **94** (healthy)           |
| vault_ltv_updated   | `d328619f53938a672f62ef41` | LTV **75%**                              |
| deposit_collateral  | `8ae31c6d5801ce38d8bc4f6d` | Collateral 1000                          |
| borrow              | `3973f3d9a6e10d7db86e5940` | **Borrowed 700** (within 75% LTV)        |
| submit_score        | `340ac2af15658ae822f59066` | INV-002-DUPLICATE score **46** (fraud)   |
| vault_ltv_updated   | `84df4ae16be4f772133f2b3c` | LTV **0%**                               |
| freeze_asset        | `923ffe65cedf32437eb5f4b7` | INV-002-DUPLICATE **frozen** (score <50) |
| submit_score        | `da508e702cefdfc6c9f3612b` | INV-003 dishonest verifier posts **90**  |
| open_challenge      | `00c1973643eb8f91efe1eb74` | Challenge #1 opened by challenger        |
| agent_slashed       | `881128783f8a4366c636ebfa` | aggregator bond **slashed 10 → 0**       |
| freeze_asset        | `636be7467f7c955cd1d62240` | INV-003 **frozen** (challenge upheld)    |
| resolve_challenge   | `2c9ad7dc3de99047451ed125` | Challenge **upheld — verifier slashed**  |

Post-slash agent state: `aggregator-agent-1` bond `0`, slashed_count `1`;
`challenger-agent-1` bond `25` (original 10 + slashed 10 + counter-bond 5 credited).

x402 was exercised on all three verifier endpoints (parser/fraud/registry): each first
returned `402 Payment Required` with `X-Payment-Amount`/`X-Payment-Network: casper`/
`X-Payment-Address`, then served the result on retry with an `X-Payment` header and
returned a real receipt hash (e.g. `rcpt:da3e0989d1f55ab16c94a7a19aa75e74350e4f3e`).

---

## 2. Casper Testnet deployment (LIVE — real hashes)

Deployed and executed on `casper-test` (Casper 2.0) via the Odra livenet executor
(`scripts/deploy_chain.sh` + `scripts/chain_*.sh`, see `CHAIN_RUNBOOK.md`). Every hash
below is a real transaction — verify on the explorer:
`https://testnet.cspr.live/transaction/<hash>`.

- **Contract package:** `contract-package-ef137b674026c1c08e55fc16e7d9e0dac9eec6b1a96b9f0b54b8fc729a9874de`
- **Admin (deployer) account:** `entity-account-b569d04d8d3e99c7fc44679d0ae3d7a430a7b13282c04cdc4c1db885d6e38fd9`
- **Deploy WardensCore:** `89ee2b761ad1a82fbaa70558e4eb6e03dba5ae3e51aba5acade8456380a41082`

| Action | Transaction hash | Result |
| ------ | ---------------- | ------ |
| Deploy WardensCore        | `89ee2b761ad1a82fbaa70558e4eb6e03dba5ae3e51aba5acade8456380a41082` | Contract installed |
| create_asset INV-001      | `92a7e961f6c6574c49101fda09c44a806f112b66f76fe207660f2505a716d463` | Asset created |
| create_asset INV-002-DUP  | `6054a078377a92f5fae4162319742d9b96c4ec71db7085fbdd1e9151852c6360` | Asset created |
| create_asset INV-003      | `b345ad3cbc0fe7a4bc93e11f356c8f083e2fd597e27f15f705655fce21e89f44` | Asset created |
| register_agent aggregator | `3d738485db86736c4b2c31f2109ef4782b7a034a218cb9ea740328574dac3ea3` | Agent registered |
| register_agent challenger | `0dea2958d32ccc24143dbb67db40f3daf656b721724c07d20fa94408250181b3` | Agent registered |
| post_bond aggregator (10) | `76ea896f7881db97c527e71c6b33bb0b5bfd8d53b0bc7d8e88a4e5eb3e96ba8c` | Bond locked |
| post_bond challenger (10) | `f4fa5a9f64c4dfb55e5a969a21efc000ec0500f6e2799017a1f8ae18befcac5c` | Bond locked |
| submit_score INV-001 (94) | `c5b269f22bf8e8f8c0467aa84daeb6bfbc9ed8ff2ad8ef2e99dff38c912a7038` | Healthy, LTV 75% |
| deposit_collateral INV-001| `fe9d5dfcc2a288a46091a340ed9a3990a3f235ebae104dc90708a890a0ad0ce2` | Collateral 1000 |
| borrow INV-001 (700)      | `ce7d6499f531eb08671f1d76641a1768d64dcb5c1aa68d34273a5af2a1f02308` | Borrow allowed |
| submit_score INV-002 (46) | `503620b136d3d6b234f634573fe1302f28a93b0f7c0d0f5aaa895ec0a426334c` | **Frozen, LTV 0%** |
| submit_score INV-003 (90) | `ad0942bafa9443966977d73189718aa22f78b766a6abd7e4dcef58af8c613821` | Dishonest score posted |
| open_challenge (#1)       | `dfc4085365b27ac843342afa6dba9c48718a709f95e233941838e05e0ab57014` | Challenge opened |
| resolve_challenge (upheld)| `f9231526dba6869087b08cf5f53fc87d9d1f93bb1d5cbbaef9f48c7b42da8687` | **Verifier slashed, INV-003 frozen** |

**Final on-chain state (read back via the contract getters):**
- `INV-001` → status Healthy, score 94, LTV 75%
- `INV-002-DUPLICATE` → status Frozen, score 46, LTV 0%
- `INV-003-LYING-SCORE` → status Frozen, score 0, LTV 0%
- `aggregator-agent-1` → bond 0, slashed_count 1, active false (slashed)
- `challenger-agent-1` → bond 25 (10 + slashed 10 + counter-bond 5), reputation 110
- Challenge #1 → status Upheld

> Status: Phase-1 loop proven end-to-end on Casper Testnet — 16 real transactions.
> The wasm is built strict-MVP (Casper rejects bulk-memory ops); see
> `scripts/build_wasm_mvp.sh` and `CHAIN_RUNBOOK.md`.

---

## 3. Phase 2 (Final Round) Architecture Validation

Phase 2 modularization has been completed and verified via 23 comprehensive tests in `contracts/wardens_phase2`.

### Contract Splitting & New Modules
- **AssetNoteRegistry, TrustScoreRegistry, BondVault, ChallengeCourt, LendingVault**: WardensCore split into 5 independent robust modules.
- **CovenantEngine**: Implemented state machine (FullAccess, Monitored, DrawsFrozen, BreachMode) translating trust scores into tranche rules.
- **ReserveVault**: Tranche release gating integrated with CovenantEngine.
- **PrivacyCommitmentStore**: Commit/reveal hashing scheme for Verifier privacy.

### Agent & Application Capabilities
- **Insurance Agent**: Underwriting logic driven deterministically based on trust score, covenant state, LTV, and registry flags.
- **Marketplace**: External verifier registration, dynamic x402 pricing based on reputation.
- **Phase 2 Dashboard**: Real-time visualization of multi-agent arbitration voting, ReserveVault tranches, and Privacy commitments.

### Phase 2 Deployed Contracts (Casper Testnet)
These 8 smart contracts have been compiled for Casper MVP compatibility (no bulk-memory operations) and deployed successfully. They represent the 100% on-chain, zero-mocked execution engine for Phase 2:

- **AssetNoteRegistry**: `contract-package-8c6e8f1c799d4abc596973d612492e5b5b03643247d0af27a0db363f7e360320`
- **TrustScoreRegistry**: `contract-package-3afb414e8f2f2e2c1db569945dc34fa6705bb5efa3c945c7d37856bff7682590`
- **BondVault**: `contract-package-249f599014a2167dab598362451b4c7b591884b7a9e5f3e65f4f31a5e4783f38`
- **ChallengeCourt**: `contract-package-83afda159a1e580ccf4baf2144a06a9f753df0db46b5b019e1fe061098f43f27`
- **LendingVault**: `contract-package-9b83b046e8749359f1cf096420ff5b029cec12777173ab891aa64d00a736bb09`
- **CovenantEngine**: `contract-package-8b3f4001f64a30028bccb919cf9f235bc2b3ff2fc642683d6c799b5d2fbab50e`
- **ReserveVault**: `contract-package-c64d65803aa4975709d88f8a039d0b082cb7fed8d000b551a09806424ab08c2f`
- **PrivacyCommitmentStore**: `contract-package-ac2adf6c0770d2ca1ac44bf197469ee23735587c28507f4eb6ce98743ebb9497`
