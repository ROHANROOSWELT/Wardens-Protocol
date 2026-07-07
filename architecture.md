# Wardens Protocol — Architecture

## Components

| Layer      | Component        | Responsibility                                                       |
| ---------- | ---------------- | -------------------------------------------------------------------- |
| Chain      | `WardensCore`    | Assets, agents/bonds, scores, challenges, lending vault, slashing    |
| Agents     | parser           | Extract invoice fields from mock JSON (x402-paid)                    |
| Agents     | fraud            | Duplicate / already-paid / double-pledge detection (x402-paid)      |
| Agents     | registry         | Issuer/debtor lookup + blacklist (x402-paid)                        |
| Agents     | aggregator       | Pay verifiers via x402, aggregate deterministically, post score     |
| Agents     | challenger       | Recheck posted scores, open challenges on suspicious highs          |
| Backend    | orchestrator     | REST API; routes calls to agents (x402) and `WardensCore`           |
| Frontend   | dashboard        | One page: score, LTV, bonds, receipts, challenges, slashes, timeline |

## Data flow — verification (Section 3 loop)

```
Dashboard ──POST /api/verify {asset_id}──► Backend
Backend ──x402──► parser  (402 → pay → receipt → {valid,score,findings})
Backend ──x402──► fraud   (402 → pay → receipt → {valid,score,findings})
Backend ──x402──► registry(402 → pay → receipt → {valid,score,findings})
Backend  scoreEngine: final = parser*0.25 + fraud*0.50 + registry*0.25   (deterministic)
Backend  evidenceHasher: SHA-256 over canonical JSON of all verifier outputs
Backend ──submit_score──► WardensCore   → status + LTV update + (freeze if <50)
Backend ◄── deploy hash + final score ── returns to Dashboard
```

## Data flow — challenge / slash

```
(dishonest verifier) ──submit_score(INV-003, 90)──► WardensCore
challenger agent: independent recheck vs ledger/registry → suspicious
challenger ──open_challenge(score_id, counter_bond)──► WardensCore  (Challenger role only)
admin/demo resolver ──resolve_challenge(id, upheld=true)──► WardensCore
   → challenged verifier bond slashed → credited to challenger
   → asset score → 0, status Frozen, vault LTV → 0
```

## Key design rules

- **Deterministic scoring** — the numeric score/pass-fail is always code, never an LLM.
  An LLM may only rewrite the human-readable *explanation* string; the demo never depends
  on an LLM call succeeding (Section 0 rule 2).
- **Evidence hashing** — one shared `canonicalizeAndHash` (sorted keys, no whitespace,
  SHA-256) used by the backend and mirrored in the agents (Section 6.7), so identical
  evidence always yields identical hashes.
- **Bonds as internal ledger** — the Qualification Round tracks bonds as a `U512` ledger
  inside `WardensCore` (Section 6.4 MVP note); real purse locking is a Phase 2 upgrade
  with the same accounting semantics.
- **Staleness** — a score older than `STALENESS_WINDOW_SECONDS = 600` yields LTV 0 and
  blocks `borrow` (Section 6.3.1); the constant is isolated for a one-line change later.
- **Access control** — caller checks at the top of each entrypoint compare against the
  stored `admin` account or the relevant agent `owner` (Section 6.6).
- **sim vs chain parity** — `backend/src/services/casperClient.ts` (sim) mirrors
  `contracts/wardens_core/src` exactly (LTV table, <50 freeze, 600s staleness, slash/
  reward), so behaviour is identical whether or not a node is attached.

## Storage layout (on-chain)

`WardensCore` stores custom `#[odra::odra_type]` structs in `Mapping`s keyed by
`asset_id` (String), `score_id`/`challenge_id` (u64), and `agent_id` (String), with
`Var` counters for score/challenge ids and a per-asset `Vec<u64>` score index (plus a
`latest_score_id` map for O(1) staleness checks). Getters expose both whole structs and
primitive fallbacks (`get_score_count` / `get_score_by_index`) per Section 6.3/6.8.
