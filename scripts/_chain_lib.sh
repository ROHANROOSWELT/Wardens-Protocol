#!/usr/bin/env bash
# Shared helpers for the chain (livenet) scripts. Source this from each script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT="$ROOT/contracts/wardens_core"
STATE="$ROOT/scripts/.chain_state"

# Optional: put your ODRA_CASPER_LIVENET_* exports in scripts/chain.env (gitignored).
[ -f "$ROOT/scripts/chain.env" ] && source "$ROOT/scripts/chain.env"
# Load previously-saved state (WARDENS_CORE_ADDRESS, INV003_SCORE_ID, CHALLENGE_ID).
[ -f "$STATE" ] && source "$STATE"
export WARDENS_CORE_ADDRESS="${WARDENS_CORE_ADDRESS:-}"

require_livenet_env() {
  local missing=0
  for v in ODRA_CASPER_LIVENET_NODE_ADDRESS ODRA_CASPER_LIVENET_CHAIN_NAME ODRA_CASPER_LIVENET_SECRET_KEY_PATH; do
    if [ -z "${!v:-}" ]; then echo "ERROR: env var $v is not set (see CHAIN_RUNBOOK.md)"; missing=1; fi
  done
  [ "$missing" -eq 0 ] || exit 1
}

require_contract_address() {
  if [ -z "${WARDENS_CORE_ADDRESS:-}" ]; then
    echo "ERROR: WARDENS_CORE_ADDRESS not set. Run scripts/deploy_chain.sh first."; exit 1
  fi
}

# Run the livenet executor with a subcommand.
wardens() {
  set +e
  # Using stdbuf to prevent buffering issues if any, though rust usually flushes lines
  ( cd "$CONTRACT" && cargo run --quiet --features livenet --bin wardens_livenet -- "$@" ) 2>&1 | while IFS= read -r line; do
    echo "$line"
    if [[ "$line" == *"OK "* || "$line" == *"SCORE_ID="* || "$line" == *"CHALLENGE_ID="* || "$line" == *"Copy CONTRACT_ADDRESS"* ]]; then
      pkill -f "wardens_livenet.*$1" 2>/dev/null || true
      break
    fi
  done
  set -e
}

# Persist a KEY=VALUE into the state file (survives across scripts).
save_state() {
  local key="$1" val="$2"
  touch "$STATE"
  grep -v "^${key}=" "$STATE" > "$STATE.tmp" 2>/dev/null || true
  echo "${key}=${val}" >> "$STATE.tmp"
  mv "$STATE.tmp" "$STATE"
}

# Deterministic evidence hash (mirrors backend evidenceHasher: sha256 over JSON).
evhash() { printf '%s' "$1" | sha256sum | awk '{print "sha256:"$1}'; }
