# Wardens Protocol — Roadmap

The Qualification Round ships a unified `WardensCore` contract for reliability. The
Final Round splits and extends it. This is future work — none of it is built yet.

## Final Round (Phase 2)

### Contract split + additions
- Split `WardensCore` → `AssetNoteRegistry`, `TrustScoreRegistry`, `BondVault`,
  `ChallengeCourt`, `LendingVault`.
- `CovenantEngine` — turns a score into an operational action (tranche release, freeze,
  reserve diversion), with its own decision policy (separate from the Phase 1 LTV table):
  ```
  score ≥ 85            → full tranche release
  70 ≤ score < 85       → reduced LTV / higher reserve requirement
  50 ≤ score < 70       → freeze new draws, keep monitoring
  score < 50            → breach state, reserve-divert mode, escalation
  ```
- `ReserveVault` — releases tranches, freezes draws, redirects reserve flows (visible
  money movement, not just a score).
- `PrivacyCommitmentStore` — commit/reveal evidence (Merkle root or hash + reveal window);
  reveal only what a dispute needs. Not a full zk-SNARK system.
- Documented liquidity/bridge adapter path toward inbound cross-chain capital.

### Agent / economics upgrades
- Reputation-weighted challenger pricing.
- Dynamic x402 price discovery per agent (fixed fee is correct for Qualification).
- Third-party verifier onboarding + external challenger marketplace + verifier SDK.
- Multi-agent arbitration for `resolve_challenge` (re-verification agent, weighted
  reputation voting, human multisig fallback) replacing the admin/demo resolver.
- Insurance-underwriting agent (stretch).
- ERC-3643 compliance adapter (strategic direction; implement if time allows).
- Real x402 facilitator settlement + on-chain `record_x402_receipt`.
- CSPR.cloud streaming/event sync + MCP integration for the challenger agent.
- Agent identity with scoped on-chain permissions once Casper account abstraction ships.

### Final Round proof bar to aim for
5+ agents, 5+ Odra contracts, double-digit on-chain interaction hashes, live dashboard.

## Post-buildathon
Production verification network · RWA issuer integrations · real invoice/ERP/payment
provider API integrations · auditor dashboard · institutional compliance module ·
mainnet deployment.
