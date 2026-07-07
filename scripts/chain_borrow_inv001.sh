#!/usr/bin/env bash
# Scene 6: deposit INV-001 as collateral and borrow within the 75% LTV.
source "$(dirname "${BASH_SOURCE[0]}")/_chain_lib.sh"
require_livenet_env; require_contract_address
wardens deposit_collateral INV-001 1000
wardens borrow INV-001 700
wardens current_ltv INV-001
echo "Record the deposit_collateral + borrow deploy hashes in PROOF.md (borrow 700 should succeed)."
