#!/usr/bin/env bash
# Scene 4-5: the aggregator posts INV-001's trust score on-chain. 94 is the
# deterministic aggregate the x402 verifiers produce
# (parser 95*0.25 + fraud 95*0.50 + registry 90*0.25 = 93.75 -> 94).
source "$(dirname "${BASH_SOURCE[0]}")/_chain_lib.sh"
require_livenet_env; require_contract_address
EV="$(evhash '{"asset_id":"INV-001","final_score":94}')"
EXPL="$(evhash '{"explanation":"Invoice valid, no duplicate found, registry confirmed"}')"
OUT="$(wardens submit_score INV-001 94 aggregator-agent-1 "$EV" "$EXPL")"
echo "$OUT"
SID="$(printf '%s\n' "$OUT" | grep '^SCORE_ID=' | cut -d= -f2)"
[ -n "$SID" ] && save_state INV001_SCORE_ID "$SID"
wardens get_asset INV-001
wardens current_ltv INV-001
echo "Record the submit_score deploy hash in PROOF.md (expect score 94, status Healthy, LTV 75%)."
