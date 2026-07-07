#!/usr/bin/env bash
# Scene 8c: the admin resolver upholds the challenge -> the verifier is slashed,
# INV-003 is frozen, and the challenger is rewarded.
source "$(dirname "${BASH_SOURCE[0]}")/_chain_lib.sh"
require_livenet_env; require_contract_address
: "${CHALLENGE_ID:?run chain_open_challenge.sh first}"
wardens resolve_challenge "$CHALLENGE_ID" true
echo "Record the resolve_challenge deploy hash in PROOF.md (challenge Upheld)."
