//! AssetNoteRegistry — Phase 2 split of WardensCore asset management.
//!
//! Manages tokenized RWA asset notes (invoices, receivables). Separated from
//! TrustScoreRegistry so asset lifecycle can be governed independently.

use crate::types::*;
use odra::casper_types::U512;
use odra::prelude::*;

#[odra::module(events = [AssetNoteCreated, AssetFrozen])]
pub struct AssetNoteRegistry {
    admin: Var<Address>,
    assets: Mapping<String, AssetNote>,
}

#[odra::module]
impl AssetNoteRegistry {
    pub fn init(&mut self, admin: Address) {
        self.admin.set(admin);
    }

    fn require_admin(&self) {
        if self.env().caller() != self.admin.get_or_revert_with(Error::NotAuthorized) {
            self.env().revert(Error::NotAuthorized);
        }
    }

    /// Create a new asset note. Admin only.
    pub fn create_asset_note(
        &mut self,
        asset_id: String,
        issuer: String,
        debtor: String,
        face_value: U512,
        due_date: u64,
        evidence_hash: String,
    ) {
        self.require_admin();
        if self.assets.get(&asset_id).is_some() {
            self.env().revert(Error::AssetAlreadyExists);
        }
        let now = self.env().get_block_time();
        let note = AssetNote {
            asset_id: asset_id.clone(),
            issuer: issuer.clone(),
            debtor,
            face_value,
            due_date,
            evidence_hash,
            status: AssetStatus::Active,
            current_score: 0,
            tranche_released: false,
            created_at: now,
            updated_at: now,
        };
        self.assets.set(&asset_id, note);
        self.env().emit_event(AssetNoteCreated { asset_id, issuer, face_value });
    }

    /// Update score + status — called by the backend orchestrator after
    /// TrustScoreRegistry records a new score.
    pub fn update_asset_score(&mut self, asset_id: String, score: u8) {
        self.require_admin();
        let mut note = self.require_note(&asset_id);
        note.current_score = score;
        note.status = status_for_score(score);
        note.updated_at = self.env().get_block_time();
        self.assets.set(&asset_id, note);
    }

    pub fn freeze_asset(&mut self, asset_id: String, reason: String) {
        self.require_admin();
        self.internal_freeze(&asset_id, reason);
    }

    pub fn mark_tranche_released(&mut self, asset_id: String) {
        self.require_admin();
        let mut note = self.require_note(&asset_id);
        note.tranche_released = true;
        self.assets.set(&asset_id, note);
    }

    pub fn get_asset_note(&self, asset_id: String) -> AssetNote {
        self.require_note(&asset_id)
    }

    pub fn asset_exists(&self, asset_id: String) -> bool {
        self.assets.get(&asset_id).is_some()
    }

    // ---- helpers ----
    pub(crate) fn require_note(&self, asset_id: &str) -> AssetNote {
        match self.assets.get(&asset_id.to_string()) {
            Some(n) => n,
            None => self.env().revert(Error::AssetNotFound),
        }
    }

    pub(crate) fn internal_freeze(&mut self, asset_id: &str, reason: String) {
        if let Some(mut note) = self.assets.get(&asset_id.to_string()) {
            note.status = AssetStatus::Frozen;
            note.updated_at = self.env().get_block_time();
            self.assets.set(&asset_id.to_string(), note);
        }
        self.env().emit_event(AssetFrozen {
            asset_id: asset_id.to_string(),
            reason,
        });
    }
}

/// Map score → AssetStatus (mirrors Phase 1 logic).
pub fn status_for_score(score: u8) -> AssetStatus {
    if score >= 90 { AssetStatus::Healthy }
    else if score >= 70 { AssetStatus::Watchlist }
    else if score >= 50 { AssetStatus::Active }
    else if score > 0 { AssetStatus::Watchlist }
    else { AssetStatus::Defaulted }
}
