#!/usr/bin/env bash
# Seed the demo: create the three assets and register + bond the aggregator and
# challenger agents. Assumes backend (:4000) and verifier agents are running
# (scripts/start_all.sh). Uses the in-process WardensCore mirror in sim mode, or
# real deploys in chain mode — the backend decides.
set -euo pipefail
B="${BACKEND_URL:-http://localhost:4000}"
j() { curl -s -H 'Content-Type: application/json' "$@"; echo; }

echo "== Register + bond agents =="
j -X POST "$B/api/agents/register" -d '{"agent_id":"aggregator-agent-1","role":"Aggregator"}'
j -X POST "$B/api/agents/bond"     -d '{"agent_id":"aggregator-agent-1","amount":10}'
j -X POST "$B/api/agents/register" -d '{"agent_id":"challenger-agent-1","role":"Challenger"}'
j -X POST "$B/api/agents/bond"     -d '{"agent_id":"challenger-agent-1","amount":10}'

echo "== Create assets =="
j -X POST "$B/api/assets" -d '{"asset_id":"INV-001","issuer":"ABC Traders","debtor":"RetailMart Ltd","face_value":1000,"due_date":1783728000}'
j -X POST "$B/api/assets" -d '{"asset_id":"INV-002-DUPLICATE","issuer":"ABC Traders","debtor":"RetailMart Ltd","face_value":1000,"due_date":1783728000}'
j -X POST "$B/api/assets" -d '{"asset_id":"INV-003-LYING-SCORE","issuer":"Fake Supplier","debtor":"Unknown Buyer","face_value":2500,"due_date":1784332800}'

echo "Seed complete."
