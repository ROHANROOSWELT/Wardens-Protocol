#!/usr/bin/env bash
# Register the on-chain agents: the aggregator (posts scores) and the challenger
# (disputes them). The parser/fraud/registry verifiers are off-chain x402 services.
source "$(dirname "${BASH_SOURCE[0]}")/_chain_lib.sh"
require_livenet_env; require_contract_address
wardens register_agent aggregator-agent-1 aggregator
wardens register_agent challenger-agent-1 challenger
echo "Record each register_agent deploy hash in PROOF.md."
