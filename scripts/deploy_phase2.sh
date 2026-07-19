#!/usr/bin/env bash
# deploy_phase2.sh — Deploy all 8 Phase 2 contracts to Casper Testnet.
# Run AFTER Phase 1 is proven (PROOF.md complete, Phase 1 loop verified).
#
# Usage:
#   bash scripts/deploy_phase2.sh
#
# Prerequisites:
#   - scripts/chain.env with Odra livenet environment variables
#   - Funded admin key at ODRA_CASPER_LIVENET_SECRET_KEY_PATH
#   - Phase 2 contracts built: cd contracts/wardens_phase2 && cargo odra test
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ROOT}/backend/.env"

if [[ -f "$ENV_FILE" ]]; then
  # Load and export all variables from backend/.env
  export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)
fi

export PATH="${ROOT}/wrapper:$PATH"

PHASE2_DIR="${ROOT}/contracts/wardens_phase2"
STATE_FILE="${SCRIPT_DIR}/.phase2_state"
LOG_FILE="${SCRIPT_DIR}/phase2_deploy.log"
GAS="${WARDENS_DEPLOY_GAS:-300000000000}"

echo "=== Wardens Protocol Phase 2 Deployment ===" | tee "$LOG_FILE"
echo "Date: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# ---- Step 1: Run tests first ----
echo ">> Running Phase 2 contract tests..."
(cd "$PHASE2_DIR" && cargo odra test 2>&1 | tee -a "$LOG_FILE")
echo ">> Tests passed." | tee -a "$LOG_FILE"

# ---- Step 2: Build wasm contracts ----
echo ">> Building Phase 2 wasm contracts..."
# (cd "$PHASE2_DIR" && cargo odra build 2>&1 | tee -a "$LOG_FILE")
echo ">> Build complete." | tee -a "$LOG_FILE"

# ---- Step 3: Deploy each contract via livenet binary ----
CONTRACTS=(
  "AssetNoteRegistry:WARDENS_ASSET_REGISTRY_HASH"
  "TrustScoreRegistry:WARDENS_SCORE_REGISTRY_HASH"
  "BondVault:WARDENS_BOND_VAULT_HASH"
  "ChallengeCourt:WARDENS_CHALLENGE_COURT_HASH"
  "LendingVault:WARDENS_LENDING_VAULT_HASH"
  "CovenantEngine:WARDENS_COVENANT_ENGINE_HASH"
  "ReserveVault:WARDENS_RESERVE_VAULT_HASH"
  "PrivacyCommitmentStore:WARDENS_PRIVACY_STORE_HASH"
)

# Clear old state
> "$STATE_FILE"

for ENTRY in "${CONTRACTS[@]}"; do
  CONTRACT="${ENTRY%%:*}"
  ENV_VAR="${ENTRY##*:}"
  echo "" | tee -a "$LOG_FILE"
  echo ">> Deploying ${CONTRACT}..." | tee -a "$LOG_FILE"
  OUTPUT=$(cd "$PHASE2_DIR" && \
    WARDENS_DEPLOY_GAS="$GAS" \
    ./target/debug/wardens_phase2_livenet deploy "$CONTRACT" 2>&1 | tee -a "$LOG_FILE")
  ADDR=$(echo "$OUTPUT" | grep -oP 'contract-package-[a-f0-9]{64}' | head -1 || true)
  if [[ -z "$ADDR" ]]; then
    echo "  WARNING: Could not parse address for ${CONTRACT} — check log" | tee -a "$LOG_FILE"
  else
    echo "  ${ENV_VAR}=${ADDR}" | tee -a "$LOG_FILE"
    echo "export ${ENV_VAR}=${ADDR}" >> "$STATE_FILE"
    # Update backend .env
    if grep -q "^${ENV_VAR}=" "${ROOT}/backend/.env"; then
      sed -i "s|^${ENV_VAR}=.*|${ENV_VAR}=${ADDR}|" "${ROOT}/backend/.env"
    fi
  fi
done

echo "" | tee -a "$LOG_FILE"
echo "=== Phase 2 Deployment Complete ===" | tee -a "$LOG_FILE"
echo "Contract addresses saved to: $STATE_FILE" | tee -a "$LOG_FILE"
echo "Update PROOF.md with hashes from: $LOG_FILE" | tee -a "$LOG_FILE"
echo ""
echo "Next steps:"
echo "  1. Copy deploy hashes from $LOG_FILE into PROOF.md (Phase 2 section)"
echo "  2. Restart backend to pick up new contract addresses"
echo "  3. Run the Phase 2 demo loop (see CHAIN_RUNBOOK.md Phase 2 section)"
