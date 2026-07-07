#!/usr/bin/env bash
# Demo Scene 8: a dishonest verifier posts a high score for the already-paid
# INV-003; the challenger agent catches it, opens a challenge, and the admin
# resolver upholds it — slashing the verifier and freezing the asset.
set -euo pipefail
B="${BACKEND_URL:-http://localhost:4000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
j() { curl -s -H 'Content-Type: application/json' "$@"; echo; }
ASSET="INV-003-LYING-SCORE"

echo "== Dishonest verifier posts score 90 on $ASSET =="
j -X POST "$B/api/verify/manual" -d "{\"asset_id\":\"$ASSET\",\"score\":90}"

echo "== Challenger agent independently rechecks and opens a challenge =="
( cd "$ROOT/agents/challenger-agent" && BACKEND_URL="$B" bun run src/index.ts "$ASSET" )

echo "== Admin resolver upholds the challenge (slash verifier, freeze asset) =="
# Resolve the most recent open challenge.
CH=$(curl -s "$B/api/dashboard/$ASSET" | grep -o '"challenge_id":[0-9]*' | head -1 | grep -o '[0-9]*')
if [ -n "${CH:-}" ]; then
  j -X POST "$B/api/challenge/resolve" -d "{\"challenge_id\":$CH,\"upheld\":true}"
fi

echo "== Final dashboard state ($ASSET) =="
j "$B/api/dashboard/$ASSET"
