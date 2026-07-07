# WardensCore — contract API

Unified Odra contract. `init(admin: Address)` sets the admin/backend wallet.

## Assets
- `create_asset(asset_id, issuer, debtor, face_value: U512, due_date: u64, evidence_hash)` — admin only. Initial status `Active`, score `0`.
- `get_asset(asset_id) -> Asset`

## Agents / bonds (internal ledger)
- `register_agent(agent_id, role: AgentRole)` — admin only. Roles: `Parser`, `FraudHeuristic`, `RegistryCheck`, `Aggregator`, `Challenger`.
- `post_bond(agent_id, amount: U512)` — owner or admin.
- `release_bond(agent_id)` — owner or admin.
- `get_agent(agent_id) -> Agent`

## Trust scores
- `submit_score(asset_id, score: u8, agent_id, evidence_hash, explanation_hash) -> score_id` — bonded verifier/aggregator (owner) only; score 0–100; opens a challenge window; updates asset status + vault LTV; freezes if score < 50.
- `get_current_score(asset_id) -> u8`
- `get_score_history(asset_id) -> Vec<TrustScore>`
- Fallbacks: `get_score(score_id)`, `get_score_count(asset_id)`, `get_score_by_index(asset_id, index)`

## Challenges
- `open_challenge(score_id, challenger_agent_id, counter_evidence_hash, counter_bond: U512) -> challenge_id` — registered `Challenger` (owner) only; must be inside the challenge window.
- `resolve_challenge(challenge_id, upheld: bool)` — admin/demo resolver only.
  - `upheld=true`: challenged verifier slashed, challenger rewarded, asset score → 0, status Frozen, LTV 0.
  - `upheld=false`: challenger loses counter-bond, verifier reputation up, asset unchanged.
- `get_challenge(challenge_id) -> Challenge`, `get_challenge_count() -> u64`

## Lending vault
- `deposit_collateral(asset_id, collateral_value: U512)`
- `current_ltv(asset_id) -> u8` — returns 0 if frozen or score is stale (>600s).
- `borrow(asset_id, amount: U512)` — rejects if frozen, stale, or amount exceeds LTV.
- `get_vault_position(asset_id) -> VaultPosition`
- `freeze_asset(asset_id)` — admin only (internal callers use the internal freeze).

### LTV table (authoritative)
| Score | LTV | | Score | LTV |
|------|-----|--|------|-----|
| ≥ 90 | 75% | | ≥ 60 | 40% |
| ≥ 75 | 60% | | ≥ 50 | 20% |
|      |     | | < 50 | 0% + frozen |

## Events
`AssetCreated`, `AgentRegistered`, `BondPosted`, `ScoreSubmitted`, `VaultLtvUpdated`,
`ChallengeOpened`, `ChallengeResolved`, `AgentSlashed`, `AssetFrozen`.
