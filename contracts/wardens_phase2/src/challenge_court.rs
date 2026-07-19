//! ChallengeCourt — Phase 2 split: multi-agent arbitration challenge market.
//!
//! Phase 1 used a single admin resolver. Phase 2 adds weighted-reputation
//! voting: any registered arbitrator can cast a vote; the challenge resolves
//! automatically once MIN_ARBITRATION_VOTES threshold is reached in either
//! direction. Admin can still force-resolve as a fallback (human multisig path).

use crate::types::*;
use odra::casper_types::U512;
use odra::prelude::*;

#[odra::module(events = [ChallengeOpened, ArbitrationVoteCast, ChallengeResolved])]
pub struct ChallengeCourt {
    admin: Var<Address>,
    challenges: Mapping<u64, Challenge>,
    challenge_count: Var<u64>,
    /// Maps challenge_id → list of agent_ids that have already voted.
    votes_cast: Mapping<u64, alloc::vec::Vec<String>>,
}

#[odra::module]
impl ChallengeCourt {
    pub fn init(&mut self, admin: Address) {
        self.admin.set(admin);
    }

    fn require_admin(&self) {
        if self.env().caller() != self.admin.get_or_revert_with(Error::NotAuthorized) {
            self.env().revert(Error::NotAuthorized);
        }
    }

    /// Open a challenge. The backend orchestrator verifies the challenger is
    /// bonded (via BondVault) and the score exists (via TrustScoreRegistry)
    /// before calling this.
    pub fn open_challenge(
        &mut self,
        score_id: u64,
        asset_id: String,
        challenged_agent_id: String,
        challenger_agent_id: String,
        counter_evidence_hash: String,
        counter_bond: U512,
    ) -> u64 {
        self.require_admin(); // backend-only in Phase 2 (orchestrator authorises)
        let now = self.env().get_block_time();
        let challenge_id = self.challenge_count.get_or_default() + 1;
        self.challenge_count.set(challenge_id);

        let ch = Challenge {
            challenge_id,
            asset_id: asset_id.clone(),
            score_id,
            challenger_agent_id: challenger_agent_id.clone(),
            challenged_agent_id,
            counter_evidence_hash,
            counter_bond,
            status: ChallengeStatus::InArbitration, // Phase 2: goes to arbitration first
            upheld_votes: 0,
            rejected_votes: 0,
            opened_at: now,
            resolved_at: 0,
        };
        self.challenges.set(&challenge_id, ch);
        self.env().emit_event(ChallengeOpened {
            challenge_id,
            asset_id,
            challenger_agent_id,
        });
        challenge_id
    }

    /// Cast an arbitration vote. Any registered agent (with sufficient reputation)
    /// can vote. Resolves automatically once MIN_ARBITRATION_VOTES is reached.
    pub fn cast_vote(
        &mut self,
        challenge_id: u64,
        arbitrator_id: String,
        vote_upheld: bool,
    ) -> bool {
        self.require_admin(); // backend verifies arbitrator reputation before calling

        let mut ch = self.require_challenge(challenge_id);
        if !matches!(ch.status, ChallengeStatus::InArbitration) {
            self.env().revert(Error::ChallengeAlreadyResolved);
        }

        // Prevent double voting.
        let mut cast = self.votes_cast.get(&challenge_id).unwrap_or_default();
        if cast.contains(&arbitrator_id) {
            self.env().revert(Error::NotAuthorized); // already voted
        }
        cast.push(arbitrator_id.clone());
        self.votes_cast.set(&challenge_id, cast);

        if vote_upheld {
            ch.upheld_votes += 1;
        } else {
            ch.rejected_votes += 1;
        }

        self.env().emit_event(ArbitrationVoteCast {
            challenge_id,
            arbitrator_id,
            vote_upheld,
        });

        // Auto-resolve once threshold reached.
        let resolved = if ch.upheld_votes >= MIN_ARBITRATION_VOTES {
            ch.status = ChallengeStatus::Upheld;
            ch.resolved_at = self.env().get_block_time();
            self.challenges.set(&challenge_id, ch);
            self.env().emit_event(ChallengeResolved { challenge_id, upheld: true });
            true
        } else if ch.rejected_votes >= MIN_ARBITRATION_VOTES {
            ch.status = ChallengeStatus::Rejected;
            ch.resolved_at = self.env().get_block_time();
            self.challenges.set(&challenge_id, ch);
            self.env().emit_event(ChallengeResolved { challenge_id, upheld: false });
            true
        } else {
            self.challenges.set(&challenge_id, ch);
            false
        };
        resolved
    }

    /// Admin / human-multisig force resolve (fallback path).
    pub fn force_resolve(&mut self, challenge_id: u64, upheld: bool) {
        self.require_admin();
        let mut ch = self.require_challenge(challenge_id);
        if !matches!(ch.status, ChallengeStatus::Open | ChallengeStatus::InArbitration) {
            self.env().revert(Error::ChallengeAlreadyResolved);
        }
        let now = self.env().get_block_time();
        ch.status = if upheld { ChallengeStatus::Upheld } else { ChallengeStatus::Rejected };
        ch.resolved_at = now;
        self.challenges.set(&challenge_id, ch);
        self.env().emit_event(ChallengeResolved { challenge_id, upheld });
    }

    pub fn get_challenge(&self, challenge_id: u64) -> Challenge {
        self.require_challenge(challenge_id)
    }

    pub fn get_challenge_count(&self) -> u64 {
        self.challenge_count.get_or_default()
    }

    fn require_challenge(&self, challenge_id: u64) -> Challenge {
        match self.challenges.get(&challenge_id) {
            Some(c) => c,
            None => self.env().revert(Error::ChallengeNotFound),
        }
    }
}
