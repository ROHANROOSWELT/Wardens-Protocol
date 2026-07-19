//! TrustScoreRegistry — Phase 2 split: immutable score ledger.
//!
//! Stores every trust score ever submitted, keyed by score_id and indexed by
//! asset_id. The score itself is never mutated after creation — disputes are
//! recorded in ChallengeCourt and settlement is applied to AssetNoteRegistry.

use crate::types::*;
use odra::prelude::*;

#[odra::module(events = [ScoreSubmitted])]
pub struct TrustScoreRegistry {
    admin: Var<Address>,
    scores: Mapping<u64, TrustScore>,
    score_count: Var<u64>,
    asset_score_ids: Mapping<String, alloc::vec::Vec<u64>>,
    latest_score_id: Mapping<String, u64>,
}

#[odra::module]
impl TrustScoreRegistry {
    pub fn init(&mut self, admin: Address) {
        self.admin.set(admin);
    }

    fn require_admin(&self) {
        if self.env().caller() != self.admin.get_or_revert_with(Error::NotAuthorized) {
            self.env().revert(Error::NotAuthorized);
        }
    }

    /// Record a new trust score. Called by the backend orchestrator after the
    /// BondVault confirms the submitting agent is active + bonded.
    pub fn record_score(
        &mut self,
        asset_id: String,
        score: u8,
        agent_id: String,
        evidence_hash: String,
        explanation_hash: String,
    ) -> u64 {
        self.require_admin();
        if score > 100 {
            self.env().revert(Error::InvalidScore);
        }
        let now = self.env().get_block_time();
        let score_id = self.score_count.get_or_default() + 1;
        self.score_count.set(score_id);

        let ts = TrustScore {
            score_id,
            asset_id: asset_id.clone(),
            score,
            agent_id: agent_id.clone(),
            evidence_hash: evidence_hash.clone(),
            explanation_hash,
            timestamp: now,
            challenge_deadline: now + CHALLENGE_WINDOW_SECONDS * 1000,
            challenged: false,
        };
        self.scores.set(&score_id, ts);

        let mut ids = self.asset_score_ids.get(&asset_id).unwrap_or_default();
        ids.push(score_id);
        self.asset_score_ids.set(&asset_id, ids);
        self.latest_score_id.set(&asset_id, score_id);

        self.env().emit_event(ScoreSubmitted {
            asset_id,
            score,
            agent_id,
            evidence_hash,
        });
        score_id
    }

    pub fn mark_challenged(&mut self, score_id: u64) {
        self.require_admin();
        let mut ts = self.require_score(score_id);
        ts.challenged = true;
        self.scores.set(&score_id, ts);
    }

    pub fn get_score(&self, score_id: u64) -> TrustScore {
        self.require_score(score_id)
    }

    pub fn get_latest_score_id(&self, asset_id: String) -> u64 {
        self.latest_score_id.get(&asset_id).unwrap_or(0)
    }

    pub fn get_score_count(&self, asset_id: String) -> u64 {
        self.asset_score_ids.get(&asset_id).unwrap_or_default().len() as u64
    }

    pub fn get_total_scores(&self) -> u64 {
        self.score_count.get_or_default()
    }

    pub fn is_score_stale(&self, asset_id: String) -> bool {
        match self.latest_score_id.get(&asset_id) {
            Some(id) => {
                let ts = self.require_score(id);
                self.env().get_block_time().saturating_sub(ts.timestamp)
                    > STALENESS_WINDOW_SECONDS * 1000
            }
            None => true,
        }
    }

    fn require_score(&self, score_id: u64) -> TrustScore {
        match self.scores.get(&score_id) {
            Some(s) => s,
            None => self.env().revert(Error::ScoreNotFound),
        }
    }
}
