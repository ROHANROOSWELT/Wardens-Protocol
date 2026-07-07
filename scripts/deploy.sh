#!/usr/bin/env bash
# DEPRECATED: the raw `casper-client put-deploy` path could not cleanly encode the
# `init(admin)` constructor arg or the AgentRole enum used by register_agent.
# Real deployment + demo execution now go through the Odra livenet executor.
#
# Deploy:  bash scripts/deploy_chain.sh
# Full runbook + demo sequence: CHAIN_RUNBOOK.md
exec "$(dirname "$0")/deploy_chain.sh" "$@"
