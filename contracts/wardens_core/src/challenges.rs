//! Challenge market: open a dispute, resolve it, and slash the losing side.
//! Resolution is admin/demo-resolver only for the Qualification Round
//! (Section 6.6 / 21.3 — multi-agent arbitration is Phase 2).

use crate::types::*;
use odra::prelude::*;
use crate::WardensCore;

impl WardensCore {
    pub(crate) fn internal_open_challenge(
        &mut self,
        score_id: u64,
        challenger_agent_id: String,
        counter_evidence_hash: String,
        counter_bond: odra::casper_types::U512,
    ) -> u64 {
        let mut score = self.require_score(score_id);
        let now = self.now();
        // Challenge must be inside the challenge window.
        if now > score.challenge_deadline {
            self.env().revert(Error::ChallengeWindowClosed);
        }
        // Challenger must be a registered, bonded Challenger agent.
        let challenger = self.require_bonded(&challenger_agent_id);
        if challenger.role != AgentRole::Challenger {
            self.env().revert(Error::WrongRole);
        }

        let challenge_id = self.challenge_count.get_or_default() + 1;
        self.challenge_count.set(challenge_id);

        let challenge = Challenge {
            challenge_id,
            asset_id: score.asset_id.clone(),
            score_id,
            challenger_agent_id: challenger_agent_id.clone(),
            challenged_agent_id: score.agent_id.clone(),
            counter_evidence_hash,
            counter_bond,
            status: ChallengeStatus::Open,
            opened_at: now,
            resolved_at: 0,
        };
        self.challenges.set(&challenge_id, challenge);

        score.challenged = true;
        let asset_id = score.asset_id.clone();
        self.scores.set(&score_id, score);

        self.env().emit_event(ChallengeOpened {
            challenge_id,
            asset_id,
            challenger_agent_id,
        });
        challenge_id
    }

    pub(crate) fn internal_resolve_challenge(&mut self, challenge_id: u64, upheld: bool) {
        let mut challenge = match self.challenges.get(&challenge_id) {
            Some(c) => c,
            None => self.env().revert(Error::ChallengeNotFound),
        };
        if challenge.status != ChallengeStatus::Open {
            self.env().revert(Error::ChallengeAlreadyResolved);
        }

        let now = self.now();
        challenge.resolved_at = now;

        if upheld {
            // Challenger was right: slash the challenged verifier, reward challenger,
            // drop the asset score, freeze the vault.
            challenge.status = ChallengeStatus::Upheld;
            let mut bad = self.require_agent(&challenge.challenged_agent_id);
            let slash_amount = bad.bonded_amount; // slash the full internal bond
            bad.bonded_amount = odra::casper_types::U512::zero();
            bad.slashed_count += 1;
            bad.active = false;
            if bad.reputation >= 50 {
                bad.reputation -= 50;
            } else {
                bad.reputation = 0;
            }
            self.agents.set(&challenge.challenged_agent_id, bad);

            // Reward: credit the slashed bond to the challenger's internal balance.
            let mut good = self.require_agent(&challenge.challenger_agent_id);
            good.bonded_amount += slash_amount + challenge.counter_bond;
            good.reputation += 10;
            good.successful_reports += 1;
            good.total_reports += 1;
            self.agents.set(&challenge.challenger_agent_id, good);

            self.env().emit_event(AgentSlashed {
                agent_id: challenge.challenged_agent_id.clone(),
                amount: slash_amount,
                recipient: challenge.challenger_agent_id.clone(),
            });

            // Asset score decreases and status becomes Frozen.
            if let Some(mut asset) = self.assets.get(&challenge.asset_id) {
                asset.current_score = 0;
                asset.updated_at = now;
                self.assets.set(&challenge.asset_id, asset);
            }
            self.internal_freeze_asset(&challenge.asset_id, "challenge upheld");
        } else {
            // Challenger was wrong: they lose their counter-bond; verifier reputation up.
            challenge.status = ChallengeStatus::Rejected;
            let mut challenger = self.require_agent(&challenge.challenger_agent_id);
            let lost = challenge.counter_bond;
            if challenger.bonded_amount >= lost {
                challenger.bonded_amount -= lost;
            } else {
                challenger.bonded_amount = odra::casper_types::U512::zero();
            }
            challenger.total_reports += 1;
            self.agents.set(&challenge.challenger_agent_id, challenger);

            let mut verifier = self.require_agent(&challenge.challenged_agent_id);
            verifier.reputation += 5;
            verifier.successful_reports += 1;
            self.agents.set(&challenge.challenged_agent_id, verifier);
            // Asset remains active — no state change beyond marking resolved.
        }

        self.challenges.set(&challenge_id, challenge);
        self.env()
            .emit_event(ChallengeResolved { challenge_id, upheld });
    }
}
