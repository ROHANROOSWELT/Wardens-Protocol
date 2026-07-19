//! CovenantEngine — Phase 2 new module.
//!
//! Encodes per-asset health states and translates trust scores into operational
//! decisions: tranche release, draw freezes, and reserve diversion. This makes
//! AI agent output operational (not just informational).
//!
//! Decision table (Section 21.2):
//!   score ≥ 85  → FullAccess  (tranche release enabled)
//!   70 ≤ s < 85 → Monitored   (reduced LTV, higher reserve requirement)
//!   50 ≤ s < 70 → DrawsFrozen (freeze new draws, keep monitoring)
//!   s < 50      → BreachMode  (reserve-divert mode, escalation)

use crate::types::*;
use odra::prelude::*;

#[odra::module(events = [CovenantStateChanged])]
pub struct CovenantEngine {
    admin: Var<Address>,
    policies: Mapping<String, CovenantPolicy>,
}

#[odra::module]
impl CovenantEngine {
    pub fn init(&mut self, admin: Address) {
        self.admin.set(admin);
    }

    fn require_admin(&self) {
        if self.env().caller() != self.admin.get_or_revert_with(Error::NotAuthorized) {
            self.env().revert(Error::NotAuthorized);
        }
    }

    /// Update covenant state based on the latest trust score. Returns the new state.
    pub fn update_policy(&mut self, asset_id: String, score: u8) -> CovenantState {
        self.require_admin();
        let state = Self::state_for_score(score);
        let now = self.env().get_block_time();
        let policy = CovenantPolicy {
            asset_id: asset_id.clone(),
            state: state.clone(),
            last_score: score,
            updated_at: now,
        };
        self.policies.set(&asset_id, policy);
        self.env().emit_event(CovenantStateChanged {
            asset_id,
            new_state: state.clone(),
            score,
        });
        state
    }

    pub fn get_policy(&self, asset_id: String) -> CovenantPolicy {
        match self.policies.get(&asset_id) {
            Some(p) => p,
            None => {
                // Default policy for assets not yet evaluated.
                CovenantPolicy {
                    asset_id,
                    state: CovenantState::Monitored,
                    last_score: 0,
                    updated_at: 0,
                }
            }
        }
    }

    pub fn are_draws_frozen(&self, asset_id: String) -> bool {
        match self.policies.get(&asset_id) {
            Some(p) => matches!(p.state, CovenantState::DrawsFrozen | CovenantState::BreachMode),
            None => false,
        }
    }

    pub fn is_tranche_release_allowed(&self, asset_id: String) -> bool {
        match self.policies.get(&asset_id) {
            Some(p) => matches!(p.state, CovenantState::FullAccess),
            None => false,
        }
    }

    fn state_for_score(score: u8) -> CovenantState {
        if score >= 85 {
            CovenantState::FullAccess
        } else if score >= 70 {
            CovenantState::Monitored
        } else if score >= 50 {
            CovenantState::DrawsFrozen
        } else {
            CovenantState::BreachMode
        }
    }
}
