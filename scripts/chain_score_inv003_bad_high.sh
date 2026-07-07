#!/usr/bin/env bash
# Scene 8a: a DISHONEST verifier posts an over-optimistic 90 for the already-paid
# INV-003. The challenger will dispute it next. Saves the score_id for the challenge.
source "$(dirname "${BASH_SOURCE[0]}")/_chain_lib.sh"
require_livenet_env; require_contract_address
EV="$(evhash '{"asset_id":"INV-003-LYING-SCORE","final_score":90}')"
EXPL="$(evhash '{"explanation":"Verifier posted score 90"}')"
OUT="$(wardens submit_score INV-003-LYING-SCORE 90 aggregator-agent-1 "$EV" "$EXPL")"
echo "$OUT"
SID="$(printf '%s\n' "$OUT" | grep '^SCORE_ID=' | cut -d= -f2)"
if [ -z "$SID" ]; then echo "ERROR: no SCORE_ID captured"; exit 1; fi
save_state INV003_SCORE_ID "$SID"
echo "Saved INV003_SCORE_ID=$SID. Record the submit_score deploy hash in PROOF.md."
