#!/usr/bin/env bash
# Scene 8b: the challenger opens a challenge against INV-003's dishonest score,
# posting a counter-bond of 5. Uses the score_id saved by the previous step.
source "$(dirname "${BASH_SOURCE[0]}")/_chain_lib.sh"
require_livenet_env; require_contract_address
: "${INV003_SCORE_ID:?run chain_score_inv003_bad_high.sh first}"
CE="$(evhash '{"reason":"invoice already paid in ledger","score_id":'"$INV003_SCORE_ID"'}')"
OUT="$(wardens open_challenge "$INV003_SCORE_ID" challenger-agent-1 "$CE" 5)"
echo "$OUT"
CID="$(printf '%s\n' "$OUT" | grep '^CHALLENGE_ID=' | cut -d= -f2)"
if [ -z "$CID" ]; then echo "ERROR: no CHALLENGE_ID captured"; exit 1; fi
save_state CHALLENGE_ID "$CID"
echo "Saved CHALLENGE_ID=$CID. Record the open_challenge deploy hash in PROOF.md."
