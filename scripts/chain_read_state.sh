#!/usr/bin/env bash
# Read-only proof: dump asset, agent, and challenge state after the loop.
# (On livenet each read uses the proxy caller and costs a little gas.)
source "$(dirname "${BASH_SOURCE[0]}")/_chain_lib.sh"
require_livenet_env; require_contract_address
echo "== Assets =="
for a in INV-001 INV-002-DUPLICATE INV-003-LYING-SCORE; do wardens get_asset "$a"; wardens current_ltv "$a"; done
echo "== Agents =="
wardens get_agent aggregator-agent-1
wardens get_agent challenger-agent-1
echo "== Challenge =="
[ -n "${CHALLENGE_ID:-}" ] && wardens get_challenge "$CHALLENGE_ID"
wardens get_challenge_count
