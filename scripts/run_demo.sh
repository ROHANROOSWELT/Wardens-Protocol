#!/usr/bin/env bash

# Kill any existing hanging scripts
pkill -f 'bash scripts/chain_' || true
pkill -f 'wardens_livenet' || true

# Revert any modified IDs back to the original clean demo IDs
for f in scripts/chain_*.sh; do
  sed -i -r 's/INV-[0-9]+(-DUPLICATE|-LYING-SCORE)?/INV-001\1/g' "$f" || true
  sed -i 's/INV-001-DUPLICATE/INV-002-DUPLICATE/g' "$f" || true
  sed -i 's/INV-001-LYING-SCORE/INV-003-LYING-SCORE/g' "$f" || true
done

echo '["INV-001","INV-002-DUPLICATE","INV-003-LYING-SCORE"]' > backend/.local/tracked_assets.json

# Fix backend IP just in case
sed -i 's|18.232.115.176|135.181.17.229|g' backend/.env || true
pm2 restart backend

# Export env vars
source ~/.cargo/env
export ODRA_CASPER_LIVENET_NODE_ADDRESS=http://135.181.17.229:7777
export ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test
export ODRA_CASPER_LIVENET_SECRET_KEY_PATH=/home/azureuser/Desktop/keys/secret_key.pem
export ODRA_CASPER_LIVENET_EVENTS_URL=http://135.181.17.229:9999/events

# Run the FULL demo sequence sequentially
nohup bash -c '
  echo "--- RUNNING DEMO SEQUENCE ---"
  bash scripts/chain_register_agents.sh && \
  bash scripts/chain_post_bonds.sh && \
  bash scripts/chain_create_asset.sh && \
  bash scripts/chain_verify_inv001.sh && \
  bash scripts/chain_borrow_inv001.sh && \
  bash scripts/chain_score_inv002_low.sh && \
  bash scripts/chain_score_inv003_bad_high.sh && \
  bash scripts/chain_open_challenge.sh && \
  bash scripts/chain_resolve_challenge.sh
' > scripts_output.log 2>&1 &
