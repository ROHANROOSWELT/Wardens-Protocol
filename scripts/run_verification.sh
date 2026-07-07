#!/usr/bin/env bash
# Demo Scenes 4–7: verify the healthy invoice, borrow against it, then verify the
# duplicate and watch the vault freeze. Requires seed_demo.sh to have run.
set -euo pipefail
B="${BACKEND_URL:-http://localhost:4000}"
j() { curl -s -H 'Content-Type: application/json' "$@"; echo; }

echo "== Verify INV-001 (healthy) via x402 =="
j -X POST "$B/api/verify" -d '{"asset_id":"INV-001"}'

echo "== Deposit collateral + borrow against INV-001 =="
j -X POST "$B/api/vault/deposit" -d '{"asset_id":"INV-001","collateral_value":1000}'
j -X POST "$B/api/vault/borrow"  -d '{"asset_id":"INV-001","amount":700}'

echo "== Verify INV-002-DUPLICATE (fraud detected → freeze) =="
j -X POST "$B/api/verify" -d '{"asset_id":"INV-002-DUPLICATE"}'

echo "== Dashboard state (INV-002-DUPLICATE) =="
j "$B/api/dashboard/INV-002-DUPLICATE"
