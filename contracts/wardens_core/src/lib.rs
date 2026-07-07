//! # WardensCore
//!
//! The single unified Odra contract for the Wardens Protocol Qualification Round
//! (Section 0 rule 1: one contract first, split only if stable). It registers
//! tokenized invoice collateral and verifier agents, locks agent bonds (internal
//! ledger), records deterministic trust scores, runs the challenge/slash market,
//! and drives a lending vault whose LTV reacts live to the score.
//!
//! Scoring itself is computed off-chain deterministically by the agents; this
//! contract only stores and enforces the consequences on-chain.

#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]
extern crate alloc;

mod agents;
mod asset;
mod challenges;
mod scores;
pub mod types;
pub mod vault;

use crate::types::*;
use crate::vault::ltv_for_score;
use odra::casper_types::U512;
use odra::prelude::*;

#[odra::module(
    events = [
        AssetCreated, AgentRegistered, BondPosted, ScoreSubmitted, VaultLtvUpdated,
        ChallengeOpened, ChallengeResolved, AgentSlashed, AssetFrozen
    ]
)]
pub struct WardensCore {
    admin: Var<Address>,
    assets: Mapping<String, Asset>,
    agents: Mapping<String, Agent>,
    scores: Mapping<u64, TrustScore>,
    score_count: Var<u64>,
    asset_score_ids: Mapping<String, alloc::vec::Vec<u64>>,
    latest_score_id: Mapping<String, u64>,
    challenges: Mapping<u64, Challenge>,
    challenge_count: Var<u64>,
    vault_positions: Mapping<String, VaultPosition>,
}

#[odra::module]
impl WardensCore {
    /// Constructor. The deploying account becomes admin unless one is given.
    pub fn init(&mut self, admin: Address) {
        self.admin.set(admin);
    }

    // ----- helpers -------------------------------------------------------
    pub(crate) fn now(&self) -> u64 {
        self.env().get_block_time()
    }

    fn require_admin(&self) {
        if self.env().caller() != self.admin.get_or_revert_with(Error::NotAuthorized) {
            self.env().revert(Error::NotAuthorized);
        }
    }

    /// Caller must own the agent, or be the admin/backend wallet (demo mode).
    fn require_owner_or_admin(&self, agent: &Agent) {
        let caller = self.env().caller();
        let admin = self.admin.get_or_revert_with(Error::NotAuthorized);
        if caller != agent.owner && caller != admin {
            self.env().revert(Error::NotAuthorized);
        }
    }

    fn is_stale(&self, asset_id: &str) -> bool {
        match self.latest_score_id.get(&asset_id.to_string()) {
            Some(id) => {
                let s = self.require_score(id);
                self.now().saturating_sub(s.timestamp) > STALENESS_WINDOW_SECONDS * 1000
            }
            None => true,
        }
    }

    // ----- asset ---------------------------------------------------------
    pub fn create_asset(
        &mut self,
        asset_id: String,
        issuer: String,
        debtor: String,
        face_value: U512,
        due_date: u64,
        evidence_hash: String,
    ) {
        self.require_admin();
        self.internal_create_asset(asset_id, issuer, debtor, face_value, due_date, evidence_hash);
    }

    pub fn get_asset(&self, asset_id: String) -> Asset {
        self.require_asset(&asset_id)
    }

    // ----- agents / bonds ------------------------------------------------
    pub fn register_agent(&mut self, agent_id: String, role: AgentRole) {
        self.require_admin();
        self.internal_register_agent(agent_id, role);
    }

    pub fn post_bond(&mut self, agent_id: String, amount: U512) {
        let agent = self.require_agent(&agent_id);
        self.require_owner_or_admin(&agent);
        self.internal_post_bond(agent_id, amount);
    }

    pub fn release_bond(&mut self, agent_id: String) {
        let agent = self.require_agent(&agent_id);
        self.require_owner_or_admin(&agent);
        self.internal_release_bond(agent_id);
    }

    pub fn get_agent(&self, agent_id: String) -> Agent {
        self.require_agent(&agent_id)
    }

    // ----- trust scores --------------------------------------------------
    /// Only a bonded verifier/aggregator agent (its owner) may submit a score.
    pub fn submit_score(
        &mut self,
        asset_id: String,
        score: u8,
        agent_id: String,
        evidence_hash: String,
        explanation_hash: String,
    ) -> u64 {
        let agent = self.require_agent(&agent_id);
        self.require_owner_or_admin(&agent);
        self.internal_submit_score(asset_id, score, agent_id, evidence_hash, explanation_hash)
    }

    pub fn get_current_score(&self, asset_id: String) -> u8 {
        self.require_asset(&asset_id).current_score
    }

    pub fn get_score_history(&self, asset_id: String) -> alloc::vec::Vec<TrustScore> {
        let ids = self.asset_score_ids.get(&asset_id).unwrap_or_default();
        ids.into_iter().map(|id| self.require_score(id)).collect()
    }

    // Primitive fallback getters (Section 6.3) in case Vec iteration is awkward.
    pub fn get_score(&self, score_id: u64) -> TrustScore {
        self.require_score(score_id)
    }
    pub fn get_score_count(&self, asset_id: String) -> u64 {
        self.asset_score_ids.get(&asset_id).unwrap_or_default().len() as u64
    }
    pub fn get_score_by_index(&self, asset_id: String, index: u64) -> TrustScore {
        let ids = self.asset_score_ids.get(&asset_id).unwrap_or_default();
        let id = ids
            .get(index as usize)
            .copied()
            .unwrap_or_else(|| self.env().revert(Error::ScoreNotFound));
        self.require_score(id)
    }

    // ----- challenges ----------------------------------------------------
    pub fn open_challenge(
        &mut self,
        score_id: u64,
        challenger_agent_id: String,
        counter_evidence_hash: String,
        counter_bond: U512,
    ) -> u64 {
        let agent = self.require_agent(&challenger_agent_id);
        self.require_owner_or_admin(&agent);
        self.internal_open_challenge(score_id, challenger_agent_id, counter_evidence_hash, counter_bond)
    }

    /// Admin/demo resolver only (Section 6.6). Phase 2 replaces this with
    /// multi-agent arbitration.
    pub fn resolve_challenge(&mut self, challenge_id: u64, upheld: bool) {
        self.require_admin();
        self.internal_resolve_challenge(challenge_id, upheld);
    }

    pub fn get_challenge(&self, challenge_id: u64) -> Challenge {
        match self.challenges.get(&challenge_id) {
            Some(c) => c,
            None => self.env().revert(Error::ChallengeNotFound),
        }
    }
    pub fn get_challenge_count(&self) -> u64 {
        self.challenge_count.get_or_default()
    }

    // ----- lending vault -------------------------------------------------
    pub fn deposit_collateral(&mut self, asset_id: String, collateral_value: U512) {
        let asset = self.require_asset(&asset_id);
        let ltv = ltv_for_score(asset.current_score);
        let pos = VaultPosition {
            asset_id: asset_id.clone(),
            borrower: self.env().caller(),
            collateral_value,
            borrowed_amount: U512::zero(),
            current_ltv: ltv,
            frozen: asset.status == AssetStatus::Frozen || ltv == 0,
        };
        self.vault_positions.set(&asset_id, pos);
        self.env().emit_event(VaultLtvUpdated {
            asset_id,
            new_ltv: ltv,
        });
    }

    /// Live LTV. Returns 0 if the latest score is stale (Section 6.3.1).
    pub fn current_ltv(&self, asset_id: String) -> u8 {
        let asset = self.require_asset(&asset_id);
        if asset.status == AssetStatus::Frozen || self.is_stale(&asset_id) {
            return 0;
        }
        ltv_for_score(asset.current_score)
    }

    pub fn borrow(&mut self, asset_id: String, amount: U512) {
        let asset = self.require_asset(&asset_id);
        let mut pos = match self.vault_positions.get(&asset_id) {
            Some(p) => p,
            None => self.env().revert(Error::VaultPositionNotFound),
        };
        if pos.frozen || asset.status == AssetStatus::Frozen {
            self.env().revert(Error::AssetFrozen);
        }
        if self.is_stale(&asset_id) {
            self.env().revert(Error::ScoreStale);
        }
        let ltv = ltv_for_score(asset.current_score);
        if ltv == 0 {
            self.env().revert(Error::AssetFrozen);
        }
        // max borrowable = collateral_value * ltv / 100
        let max_borrow = pos.collateral_value * U512::from(ltv) / U512::from(100u8);
        if pos.borrowed_amount + amount > max_borrow {
            self.env().revert(Error::ExceedsLtv);
        }
        pos.borrowed_amount += amount;
        pos.current_ltv = ltv;
        self.vault_positions.set(&asset_id, pos);
    }

    pub fn get_vault_position(&self, asset_id: String) -> VaultPosition {
        match self.vault_positions.get(&asset_id) {
            Some(p) => p,
            None => self.env().revert(Error::VaultPositionNotFound),
        }
    }

    /// Admin/demo-resolver only external freeze (Section 6.6). Internal callers
    /// use `internal_freeze_asset` directly.
    pub fn freeze_asset(&mut self, asset_id: String) {
        self.require_admin();
        self.internal_freeze_asset(&asset_id, "admin freeze");
    }
}

#[cfg(test)]
mod tests;
