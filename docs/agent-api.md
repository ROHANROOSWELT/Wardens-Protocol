# Agent & backend API

## x402 verifier agents (parser / fraud / registry)

Each exposes one x402-gated endpoint. First request → `402 Payment Required` with
headers; retry with `X-Payment` → result + receipt.

```
402 Payment Required
X-Payment-Amount: 1000000
X-Payment-Network: casper
X-Payment-Address: <agent-wallet>
```

Retry: `X-Payment: casper:<payer>:<amount>:<signature>` → `200`:
```json
{ "paid": true, "x402_receipt": "rcpt:...", "agent": "fraud-agent-1",
  "valid": false, "score": 0, "findings": ["..."], "evidence_hash": "sha256:..." }
```

| Agent    | Port | Path              | Input                                     |
| -------- | ---- | ----------------- | ----------------------------------------- |
| parser   | 4101 | `/verify/parse`   | `{ asset_id }`                            |
| fraud    | 4102 | `/verify/fraud`   | `{ asset_id, invoice_number, amount }`    |
| registry | 4103 | `/verify/registry`| `{ issuer, debtor }`                      |

Health: `GET /health`. Scoring is deterministic; no LLM is used for scores.

### aggregator agent
`bun run src/index.ts <asset_id>` → calls backend `/api/verify` (which performs the x402
payments + deterministic weighting + `submit_score`).

### challenger agent
`bun run src/index.ts <asset_id>` → independent recheck vs ledger/registry; opens a
challenge via backend `/api/challenge/open` if a high posted score looks wrong.

## Backend orchestrator (`:4000`)

| Method + path                 | Body / params                                  | Action |
| ----------------------------- | ---------------------------------------------- | ------ |
| `POST /api/assets`            | `{asset_id,issuer,debtor,face_value,due_date}` | hash + `create_asset` |
| `GET  /api/assets/:id`        | —                                              | asset |
| `POST /api/agents/register`   | `{agent_id, role}`                             | `register_agent` |
| `POST /api/agents/bond`       | `{agent_id, amount}`                           | `post_bond` |
| `GET  /api/agents`            | —                                              | reputation view |
| `POST /api/verify`            | `{asset_id, agent_id?}`                         | x402 verify → aggregate → `submit_score` |
| `POST /api/verify/manual`     | `{asset_id, score, agent_id?}`                  | dishonest/independent verifier posts a score |
| `POST /api/challenge/open`    | `{score_id, challenger_agent_id, reason}`       | `open_challenge` |
| `POST /api/challenge/resolve` | `{challenge_id, upheld}`                        | `resolve_challenge` |
| `POST /api/vault/deposit`     | `{asset_id, collateral_value}`                  | `deposit_collateral` |
| `POST /api/vault/borrow`      | `{asset_id, amount}`                            | `borrow` |
| `GET  /api/dashboard/:id`     | —                                              | full dashboard state |
| `GET  /api/transactions`      | —                                              | tx timeline |
