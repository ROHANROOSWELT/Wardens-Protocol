#!/usr/bin/env bash
# Deploy WardensCore to Casper Testnet via the Odra livenet executor.
# Admin is initialized to the funded deployer account automatically.
source "$(dirname "${BASH_SOURCE[0]}")/_chain_lib.sh"
require_livenet_env

# The deployed wasm MUST be strict-MVP (Casper rejects bulk-memory ops). Build it
# with the dedicated script if it's missing or not MVP-valid.
WASM="$CONTRACT/wasm/WardensCore.wasm"
if [ ! -f "$WASM" ] || { command -v wasm-tools >/dev/null 2>&1 && ! wasm-tools validate --features=mvp "$WASM" >/dev/null 2>&1; }; then
  echo "== wasm missing or not MVP-valid — building Casper-compatible wasm =="
  bash "$(dirname "${BASH_SOURCE[0]}")/build_wasm_mvp.sh"
fi

echo "== Building + deploying WardensCore (this takes a minute and costs ~300 CSPR gas) =="
OUT="$(wardens deploy)"
echo "$OUT"

ADDR="$(printf '%s\n' "$OUT" | grep '^CONTRACT_ADDRESS=' | cut -d= -f2-)"
if [ -z "$ADDR" ]; then echo "ERROR: no CONTRACT_ADDRESS in output"; exit 1; fi
save_state WARDENS_CORE_ADDRESS "$ADDR"
echo
echo "Saved WARDENS_CORE_ADDRESS=$ADDR to scripts/.chain_state"
echo "Record this contract address + the deploy hash (from the Odra log above) in PROOF.md."
