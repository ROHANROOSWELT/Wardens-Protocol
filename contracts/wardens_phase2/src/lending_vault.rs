//! LendingVault — Phase 2 split: collateral management + LTV enforcement.
//!
//! Reads covenant state from CovenantEngine to determine whether draws are
//! frozen (breach mode) before allowing borrows.

use crate::types::*;
use odra::casper_types::U512;
use odra::prelude::*;

/// LTV per score tier (Section 6.3 — authoritative rule).
pub fn ltv_for_score(score: u8) -> u8 {
    if score >= 90 { 75 }
    else if score >= 75 { 60 }
    else if score >= 60 { 40 }
    else if score >= 50 { 20 }
    else { 0 }
}

pub fn is_frozen_score(score: u8) -> bool {
    score < 50
}

#[odra::module(events = [VaultLtvUpdated, AssetFrozen])]
pub struct LendingVault {
    admin: Var<Address>,
    positions: Mapping<String, VaultPosition>,
}

#[odra::module]
impl LendingVault {
    pub fn init(&mut self, admin: Address) {
        self.admin.set(admin);
    }

    fn require_admin(&self) {
        if self.env().caller() != self.admin.get_or_revert_with(Error::NotAuthorized) {
            self.env().revert(Error::NotAuthorized);
        }
    }

    pub fn deposit_collateral(
        &mut self,
        asset_id: String,
        collateral_value: U512,
    ) {
        self.require_admin();
        let caller = self.env().caller();
        let pos = VaultPosition {
            asset_id: asset_id.clone(),
            borrower: caller,
            collateral_value,
            borrowed_amount: U512::zero(),
            current_ltv: 0,
            frozen: false,
        };
        self.positions.set(&asset_id, pos);
    }

    /// Update LTV after a new score is recorded. Called by the backend orchestrator.
    pub fn apply_ltv(&mut self, asset_id: String, score: u8, draws_frozen: bool) {
        self.require_admin();
        if let Some(mut pos) = self.positions.get(&asset_id) {
            // CovenantEngine breach mode overrides LTV to 0 even if score is OK.
            let new_ltv = if draws_frozen { 0 } else { ltv_for_score(score) };
            pos.current_ltv = new_ltv;
            pos.frozen = is_frozen_score(score) || draws_frozen;
            self.positions.set(&asset_id, pos);
        }
        self.env().emit_event(VaultLtvUpdated {
            asset_id,
            new_ltv: ltv_for_score(score),
        });
    }

    pub fn borrow(&mut self, asset_id: String, amount: U512) {
        self.require_admin();
        let mut pos = self.require_position(&asset_id);
        if pos.frozen {
            self.env().revert(Error::AssetFrozen);
        }
        let max = pos.collateral_value * U512::from(pos.current_ltv as u64) / U512::from(100u64);
        if pos.borrowed_amount + amount > max {
            self.env().revert(Error::ExceedsLtv);
        }
        pos.borrowed_amount += amount;
        self.positions.set(&asset_id, pos);
    }

    pub fn freeze_position(&mut self, asset_id: String) {
        self.require_admin();
        if let Some(mut pos) = self.positions.get(&asset_id) {
            pos.frozen = true;
            pos.current_ltv = 0;
            self.positions.set(&asset_id, pos);
        }
        self.env().emit_event(AssetFrozen {
            asset_id,
            reason: "vault frozen by orchestrator".to_string(),
        });
    }

    pub fn get_position(&self, asset_id: String) -> VaultPosition {
        self.require_position(&asset_id)
    }

    pub fn current_ltv(&self, asset_id: String) -> u8 {
        self.positions.get(&asset_id).map(|p| p.current_ltv).unwrap_or(0)
    }

    fn require_position(&self, asset_id: &str) -> VaultPosition {
        match self.positions.get(&asset_id.to_string()) {
            Some(p) => p,
            None => self.env().revert(Error::VaultPositionNotFound),
        }
    }
}
