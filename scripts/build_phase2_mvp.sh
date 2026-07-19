#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
C="$ROOT/contracts/wardens_phase2"

export PATH="${ROOT}/binaryen-version_117/bin:$PATH"

command -v wasm-opt >/dev/null 2>&1 || {
  echo "ERROR: wasm-opt not found."
  exit 1
}

rustup component add rust-src >/dev/null 2>&1 || true

cd "$C"
mkdir -p wasm

CONTRACTS=(
  "AssetNoteRegistry"
  "TrustScoreRegistry"
  "BondVault"
  "ChallengeCourt"
  "LendingVault"
  "CovenantEngine"
  "ReserveVault"
  "PrivacyCommitmentStore"
)

for contract in "${CONTRACTS[@]}"; do
  echo "== Building $contract without post-MVP features =="
  RUSTFLAGS="-Ctarget-feature=-bulk-memory,-bulk-memory-opt,-sign-ext,-reference-types,-multivalue,-nontrapping-fptoint" \
  ODRA_MODULE="$contract" \
  cargo build --release --target wasm32-unknown-unknown \
    -Z build-std=core,alloc \
    --bin wardens_phase2_build_contract
  
  RAW="target/wasm32-unknown-unknown/release/wardens_phase2_build_contract.wasm"
  echo "== Normalizing to strict MVP with wasm-opt =="
  wasm-opt "$RAW" -o "wasm/${contract}.wasm" -Oz --mvp-features --strip-target-features 
done

echo "All Phase 2 contracts built successfully for strict MVP."
