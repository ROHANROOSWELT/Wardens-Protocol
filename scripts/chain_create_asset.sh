#!/usr/bin/env bash
# Create the three demo assets on-chain (INV-001 healthy, INV-002-DUPLICATE fraud,
# INV-003-LYING-SCORE already-paid). due_date values are fixed unix timestamps.
source "$(dirname "${BASH_SOURCE[0]}")/_chain_lib.sh"
require_livenet_env; require_contract_address

wardens create_asset INV-001 "ABC Corporation" "XYC Limited" 1000 1783728000 "$(evhash '{"amount":1000,"asset_id":"INV-001","debtor":"XYC Limited","issuer":"ABC Corporation"}')"
wardens create_asset INV-002-DUPLICATE "ABC Corporation" "XYC Limited" 1000 1783728000 "$(evhash '{"amount":1000,"asset_id":"INV-002-DUPLICATE","debtor":"XYC Limited","issuer":"ABC Corporation"}')"
wardens create_asset INV-003-LYING-SCORE "Fake Supplier" "Unknown Buyer" 2500 1784332800 "$(evhash '{"amount":2500,"asset_id":"INV-003-LYING-SCORE","debtor":"Unknown Buyer","issuer":"Fake Supplier"}')"
echo "Record each create_asset deploy hash (from the Odra log) in PROOF.md."
