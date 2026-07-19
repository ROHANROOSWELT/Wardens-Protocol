//! PrivacyCommitmentStore — Phase 2 new module.
//!
//! Stores Merkle-root evidence commitments submitted by verifier agents. Agents
//! reveal only the specific evidence leaf needed to resolve a dispute, rather
//! than exposing full documents on-chain. This is a commit/reveal scheme — not a
//! full ZK-SNARK system (which is a post-buildathon upgrade, per Section 21.1).
//!
//! Flow:
//!  1. Agent commits: `store_commitment(asset_id, merkle_root)` — only the root
//!     goes on-chain.
//!  2. At dispute time: `reveal_commitment(commitment_id, reveal_hash)` — the
//!     agent reveals the specific leaf hash; the contract verifies it against the
//!     stored root using a simple hash equality check (full Merkle proof
//!     verification is the ZK upgrade path).

use crate::types::*;
use odra::prelude::*;

#[odra::module(events = [CommitmentStored, CommitmentRevealed])]
pub struct PrivacyCommitmentStore {
    admin: Var<Address>,
    commitments: Mapping<u64, Commitment>,
    commitment_count: Var<u64>,
    asset_commitments: Mapping<String, alloc::vec::Vec<u64>>,
    /// Reveal window after a commitment: 24 hours (in ms).
    reveal_window_ms: Var<u64>,
}

#[odra::module]
impl PrivacyCommitmentStore {
    pub fn init(&mut self, admin: Address) {
        self.admin.set(admin);
        self.reveal_window_ms.set(86_400_000u64); // 24 h
    }

    fn require_admin(&self) {
        if self.env().caller() != self.admin.get_or_revert_with(Error::NotAuthorized) {
            self.env().revert(Error::NotAuthorized);
        }
    }

    /// Store a Merkle-root commitment. Only the hash goes on-chain — the
    /// underlying evidence stays off-chain with the verifier agent.
    pub fn store_commitment(
        &mut self,
        asset_id: String,
        committer: String,
        merkle_root: String,
    ) -> u64 {
        self.require_admin();
        let now = self.env().get_block_time();
        let commitment_id = self.commitment_count.get_or_default() + 1;
        self.commitment_count.set(commitment_id);
        let window = self.reveal_window_ms.get_or_default();
        let c = Commitment {
            commitment_id,
            asset_id: asset_id.clone(),
            committer,
            merkle_root: merkle_root.clone(),
            revealed: false,
            reveal_hash: String::new(),
            committed_at: now,
            reveal_deadline: now + window,
        };
        self.commitments.set(&commitment_id, c);
        let mut ids = self.asset_commitments.get(&asset_id).unwrap_or_default();
        ids.push(commitment_id);
        self.asset_commitments.set(&asset_id, ids);
        self.env().emit_event(CommitmentStored {
            commitment_id,
            asset_id,
            merkle_root,
        });
        commitment_id
    }

    /// Reveal specific evidence for dispute resolution. The reveal_hash must
    /// match the stored merkle_root (equality check — full Merkle proof
    /// verification is the ZK upgrade path). Window must still be open.
    pub fn reveal_commitment(
        &mut self,
        commitment_id: u64,
        reveal_hash: String,
    ) {
        self.require_admin();
        let mut c = self.require_commitment(commitment_id);
        if c.revealed {
            self.env().revert(Error::AlreadyRevealed);
        }
        let now = self.env().get_block_time();
        if now > c.reveal_deadline {
            self.env().revert(Error::RevealWindowClosed);
        }
        // Simple hash equality check (full Merkle proof is the ZK upgrade path).
        if reveal_hash != c.merkle_root {
            self.env().revert(Error::InvalidCommitment);
        }
        c.revealed = true;
        c.reveal_hash = reveal_hash.clone();
        self.commitments.set(&commitment_id, c);
        self.env().emit_event(CommitmentRevealed { commitment_id, reveal_hash });
    }

    pub fn get_commitment(&self, commitment_id: u64) -> Commitment {
        self.require_commitment(commitment_id)
    }

    pub fn get_asset_commitments(&self, asset_id: String) -> alloc::vec::Vec<u64> {
        self.asset_commitments.get(&asset_id).unwrap_or_default()
    }

    fn require_commitment(&self, commitment_id: u64) -> Commitment {
        match self.commitments.get(&commitment_id) {
            Some(c) => c,
            None => self.env().revert(Error::CommitmentNotFound),
        }
    }
}
