//! ReserveVault — Phase 2 new module.
//!
//! Manages capital tranches for each RWA asset. CovenantEngine drives whether a
//! tranche can be released or must be blocked. Gives the protocol visible money
//! movement (not just a score), making AI agent output economically consequential.

use crate::types::*;
use odra::casper_types::U512;
use odra::prelude::*;

#[odra::module(events = [TrancheReleased, TrancheBlocked])]
pub struct ReserveVault {
    admin: Var<Address>,
    tranches: Mapping<u64, TrancheRecord>,
    tranche_count: Var<u64>,
    asset_tranches: Mapping<String, alloc::vec::Vec<u64>>,
}

#[odra::module]
impl ReserveVault {
    pub fn init(&mut self, admin: Address) {
        self.admin.set(admin);
    }

    fn require_admin(&self) {
        if self.env().caller() != self.admin.get_or_revert_with(Error::NotAuthorized) {
            self.env().revert(Error::NotAuthorized);
        }
    }

    /// Register a new tranche for an asset.
    pub fn create_tranche(&mut self, asset_id: String, amount: U512) -> u64 {
        self.require_admin();
        let tranche_id = self.tranche_count.get_or_default() + 1;
        self.tranche_count.set(tranche_id);
        let tr = TrancheRecord {
            asset_id: asset_id.clone(),
            tranche_id,
            amount,
            released: false,
            released_at: 0,
            blocked: false,
        };
        self.tranches.set(&tranche_id, tr);
        let mut ids = self.asset_tranches.get(&asset_id).unwrap_or_default();
        ids.push(tranche_id);
        self.asset_tranches.set(&asset_id, ids);
        tranche_id
    }

    /// Release a tranche — only if CovenantEngine says FullAccess.
    /// `tranche_release_allowed` is passed in by the backend orchestrator after
    /// querying CovenantEngine.
    pub fn release_tranche(&mut self, tranche_id: u64, tranche_release_allowed: bool) {
        self.require_admin();
        if !tranche_release_allowed {
            self.env().revert(Error::DrawsFrozen);
        }
        let mut tr = self.require_tranche(tranche_id);
        if tr.released {
            self.env().revert(Error::TrancheAlreadyReleased);
        }
        if tr.blocked {
            self.env().revert(Error::DrawsFrozen);
        }
        let now = self.env().get_block_time();
        tr.released = true;
        tr.released_at = now;
        let asset_id = tr.asset_id.clone();
        let amount = tr.amount;
        self.tranches.set(&tranche_id, tr);
        self.env().emit_event(TrancheReleased { asset_id, tranche_id, amount });
    }

    /// Block a tranche (called when covenant enters BreachMode or DrawsFrozen).
    pub fn block_tranche(&mut self, tranche_id: u64, reason: String) {
        self.require_admin();
        let mut tr = self.require_tranche(tranche_id);
        let asset_id = tr.asset_id.clone();
        tr.blocked = true;
        self.tranches.set(&tranche_id, tr);
        self.env().emit_event(TrancheBlocked { asset_id, tranche_id, reason });
    }

    pub fn get_tranche(&self, tranche_id: u64) -> TrancheRecord {
        self.require_tranche(tranche_id)
    }

    pub fn get_asset_tranches(&self, asset_id: String) -> alloc::vec::Vec<u64> {
        self.asset_tranches.get(&asset_id).unwrap_or_default()
    }

    pub fn get_tranche_count(&self) -> u64 {
        self.tranche_count.get_or_default()
    }

    fn require_tranche(&self, tranche_id: u64) -> TrancheRecord {
        match self.tranches.get(&tranche_id) {
            Some(t) => t,
            None => self.env().revert(Error::TrancheNotFound),
        }
    }
}
