# Demo script (2–2.5 minutes)

Record with the dashboard open (`http://localhost:3000`) and the backend + agents running
(`bash scripts/start_all.sh`). Each scene maps to a dashboard action button or a script.

## Scene 1 — Intro (~15s)
> "Wardens Protocol is Casper's live trust layer for tokenized RWA credit. It lets AI
> agents verify collateral, challenger agents slash false reports, and lending vaults
> update risk on-chain in real time."

## Scene 2 — Create invoice collateral
Select `INV-001` → **1 · Create asset**. On-chain: `create_asset(INV-001)`.
Show: transaction hash in the timeline, asset appears, status = Active.

## Scene 3 — Register and bond verifier agent
(Handled automatically by **Run verification**, which registers + bonds the aggregator
and challenger agents.) On-chain: `register_agent(aggregator-agent-1)`,
`post_bond(aggregator-agent-1, 10)`. Show: agent bonded, allowed to submit scores.

## Scene 4 — x402 verification
Click **2 · Run verification (x402)**. Backend pays parser, fraud, registry via x402.
Show: three x402 receipt cards (402 → paid), verifier outputs.

## Scene 5 — Submit trust score
Aggregator posts final score **94**. On-chain: `submit_score(INV-001, 94)`.
Dashboard: Trust Score 94, LTV 75%, Status Healthy, Borrowing ENABLED.

## Scene 6 — Borrow from vault
Click **3 · Deposit + borrow**. On-chain: `borrow(INV-001, 700)`.
Show: borrow succeeds because the score is high.

## Scene 7 — Fraudulent collateral
Select `INV-002-DUPLICATE` → **Create asset** → **Run verification**. The fraud agent
detects the duplicate (same invoice number, pledged under INV-001). On-chain:
`submit_score(INV-002-DUPLICATE, 46)`. Dashboard: Trust Score 46, LTV 0%, Status Frozen.
> "The vault reacts automatically. No human audit cycle."

## Scene 8 — Challenger slashes a bad verifier
Select `INV-003-LYING-SCORE` → **Create asset** → **Post dishonest score (90)** →
**Open challenge** → **Resolve: uphold + slash**. On-chain: `submit_score(INV-003, 90)`,
`open_challenge(score_id)`, `resolve_challenge(challenge_id, true)`.
Dashboard: Challenge Upheld, Verifier Slashed (bond 10 → 0), Challenger Rewarded, Asset Frozen.
> "This is what makes Wardens different. AI agents do not just report truth — they
> financially police each other."

## One-shot alternative (terminal)
```bash
bash scripts/seed_demo.sh
bash scripts/run_verification.sh
bash scripts/run_challenge.sh
```
