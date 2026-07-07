#!/usr/bin/env bash
# Build a Casper-compatible (strict-MVP) WardensCore wasm.
#
# Why this exists: Casper's execution engine rejects wasm "bulk memory"
# operations ("Wasm preprocessing error: ... Bulk memory operations are not
# supported"). Modern Rust enables the `bulk-memory`/`bulk-memory-opt` (and
# `sign-ext`, `reference-types`) target features by default, and the precompiled
# wasm sysroot ships with them, so a plain `cargo odra build` produces wasm the
# node refuses. This script:
#   1. rebuilds core/alloc from source with those features OFF (-Z build-std), and
#   2. normalizes the module down to strict MVP with wasm-opt.
#
# Requires: rust-src component (added automatically), binaryen `wasm-opt` on PATH,
# and optionally `wasm-tools` for validation.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
C="$ROOT/contracts/wardens_core"

command -v wasm-opt >/dev/null 2>&1 || {
  echo "ERROR: wasm-opt (binaryen) not found on PATH."
  echo "  Install: 'apt-get install binaryen'  OR download a release from"
  echo "  https://github.com/WebAssembly/binaryen/releases and put wasm-opt on PATH."
  exit 1
}

rustup component add rust-src >/dev/null 2>&1 || true

echo "== Building WardensCore wasm without post-MVP features (build-std) =="
cd "$C"
RUSTFLAGS="-Ctarget-feature=-bulk-memory,-bulk-memory-opt,-sign-ext,-reference-types,-multivalue,-nontrapping-fptoint" \
ODRA_MODULE=WardensCore \
cargo build --release --target wasm32-unknown-unknown \
  -Z build-std=core,alloc \
  --bin wardens_core_build_contract

RAW="target/wasm32-unknown-unknown/release/wardens_core_build_contract.wasm"
mkdir -p wasm
echo "== Normalizing to strict MVP with wasm-opt =="
wasm-opt "$RAW" -o wasm/WardensCore.wasm -Oz --mvp-features --strip-target-features

if command -v wasm-tools >/dev/null 2>&1; then
  wasm-tools validate --features=mvp wasm/WardensCore.wasm \
    && echo "wasm/WardensCore.wasm is strict-MVP valid ✓" \
    || { echo "ERROR: wasm still contains post-MVP features"; exit 1; }
else
  echo "(install 'cargo install wasm-tools' to validate MVP compatibility)"
fi
echo "Built wasm/WardensCore.wasm ($(wc -c < wasm/WardensCore.wasm) bytes)"
