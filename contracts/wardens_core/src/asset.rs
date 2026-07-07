//! Asset (tokenized invoice collateral) storage helpers.
//! These are plain internal methods on `WardensCore`; entrypoints in `lib.rs`
//! delegate here so the asset logic lives in one place.

use crate::types::*;
use odra::prelude::*;
use crate::WardensCore;
use odra::casper_types::U512;

impl WardensCore {
    pub(crate) fn internal_create_asset(
        &mut self,
        asset_id: String,
        issuer: String,
        debtor: String,
        face_value: U512,
        due_date: u64,
        evidence_hash: String,
    ) {
        if self.assets.get(&asset_id).is_some() {
            self.env().revert(Error::AssetAlreadyExists);
        }
        let now = self.now();
        let asset = Asset {
            asset_id: asset_id.clone(),
            issuer: issuer.clone(),
            debtor,
            face_value,
            due_date,
            evidence_hash,
            status: AssetStatus::Active, // initial status = Active, score 0
            current_score: 0,
            created_at: now,
            updated_at: now,
        };
        self.assets.set(&asset_id, asset);
        self.env().emit_event(AssetCreated {
            asset_id,
            issuer,
            face_value,
        });
    }

    pub(crate) fn require_asset(&self, asset_id: &str) -> Asset {
        match self.assets.get(&asset_id.to_string()) {
            Some(a) => a,
            None => self.env().revert(Error::AssetNotFound),
        }
    }

    /// Internal-only freeze (Section 6.6: never called directly by an external
    /// caller — only from submit_score / resolve_challenge / admin resolver).
    pub(crate) fn internal_freeze_asset(&mut self, asset_id: &str, reason: &str) {
        let mut asset = self.require_asset(asset_id);
        asset.status = AssetStatus::Frozen;
        asset.updated_at = self.now();
        self.assets.set(&asset_id.to_string(), asset);

        if let Some(mut pos) = self.vault_positions.get(&asset_id.to_string()) {
            pos.frozen = true;
            pos.current_ltv = 0;
            self.vault_positions.set(&asset_id.to_string(), pos);
        }
        self.env().emit_event(AssetFrozen {
            asset_id: asset_id.to_string(),
            reason: reason.to_string(),
        });
        self.env().emit_event(VaultLtvUpdated {
            asset_id: asset_id.to_string(),
            new_ltv: 0,
        });
    }
}
