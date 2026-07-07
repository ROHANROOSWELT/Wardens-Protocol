//! Trust-score submission, history, and the LTV update it triggers.

use crate::types::*;
use odra::prelude::*;
use crate::vault::{is_frozen_score, ltv_for_score, status_for_score};
use crate::WardensCore;

impl WardensCore {
    pub(crate) fn internal_submit_score(
        &mut self,
        asset_id: String,
        score: u8,
        agent_id: String,
        evidence_hash: String,
        explanation_hash: String,
    ) -> u64 {
        // Rules (Section 6.3): agent registered + bonded, score 0..=100, asset exists.
        if score > 100 {
            self.env().revert(Error::InvalidScore);
        }
        self.require_bonded(&agent_id);
        let mut asset = self.require_asset(&asset_id);

        let now = self.now();
        let score_id = self.score_count.get_or_default() + 1;
        self.score_count.set(score_id);

        let trust = TrustScore {
            score_id,
            asset_id: asset_id.clone(),
            score,
            agent_id: agent_id.clone(),
            evidence_hash: evidence_hash.clone(),
            explanation_hash,
            timestamp: now,
            challenge_deadline: now + STALENESS_WINDOW_SECONDS * 1000, // ms
            challenged: false,
        };
        self.scores.set(&score_id, trust);

        // Append to this asset's score index (fallback getter pattern, Section 6.3).
        let mut ids = self.asset_score_ids.get(&asset_id).unwrap_or_default();
        ids.push(score_id);
        self.asset_score_ids.set(&asset_id, ids);
        self.latest_score_id.set(&asset_id, score_id);

        // Update asset score + status.
        asset.current_score = score;
        asset.status = status_for_score(score);
        asset.updated_at = now;
        self.assets.set(&asset_id, asset);

        // Update vault LTV.
        let new_ltv = ltv_for_score(score);
        self.apply_ltv(&asset_id, new_ltv);

        self.env().emit_event(ScoreSubmitted {
            asset_id: asset_id.clone(),
            score,
            agent_id: agent_id.clone(),
            evidence_hash,
        });
        // Track reporting stats.
        if let Some(mut agent) = self.agents.get(&agent_id) {
            agent.total_reports += 1;
            self.agents.set(&agent_id, agent);
        }

        // A low score freezes the collateral automatically.
        if is_frozen_score(score) {
            self.internal_freeze_asset(&asset_id, "score below 50");
        }
        score_id
    }

    /// Update the vault position's LTV (if a position exists) and emit the event.
    pub(crate) fn apply_ltv(&mut self, asset_id: &str, new_ltv: u8) {
        if let Some(mut pos) = self.vault_positions.get(&asset_id.to_string()) {
            pos.current_ltv = new_ltv;
            pos.frozen = new_ltv == 0;
            self.vault_positions.set(&asset_id.to_string(), pos);
        }
        self.env().emit_event(VaultLtvUpdated {
            asset_id: asset_id.to_string(),
            new_ltv,
        });
    }

    pub(crate) fn require_score(&self, score_id: u64) -> TrustScore {
        match self.scores.get(&score_id) {
            Some(s) => s,
            None => self.env().revert(Error::ScoreNotFound),
        }
    }
}
