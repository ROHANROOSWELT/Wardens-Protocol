#!/usr/bin/env bash
# Bond both agents (internal-ledger stake) so they may submit scores / open challenges.
source "$(dirname "${BASH_SOURCE[0]}")/_chain_lib.sh"
require_livenet_env; require_contract_address
wardens post_bond aggregator-agent-1 10
wardens post_bond challenger-agent-1 10
echo "Record each post_bond deploy hash in PROOF.md."
