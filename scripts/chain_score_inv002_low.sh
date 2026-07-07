#!/usr/bin/env bash
# Scene 7: the fraud agent flags INV-002-DUPLICATE (double-pledge). Deterministic
# aggregate = parser 95*0.25 + fraud 0*0.50 + registry 90*0.25 = 46 -> frozen.
source "$(dirname "${BASH_SOURCE[0]}")/_chain_lib.sh"
require_livenet_env; require_contract_address
EV="$(evhash '{"asset_id":"INV-002-DUPLICATE","final_score":46}')"
EXPL="$(evhash '{"explanation":"Duplicate invoice number; already pledged under INV-001"}')"
wardens submit_score INV-002-DUPLICATE 46 aggregator-agent-1 "$EV" "$EXPL"
wardens get_asset INV-002-DUPLICATE
wardens current_ltv INV-002-DUPLICATE
echo "Record the submit_score deploy hash in PROOF.md (expect score 46, status Frozen, LTV 0%)."
