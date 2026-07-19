//! Shared types, enums, errors, and events for all Phase 2 contracts.

use odra::casper_types::U512;
use odra::prelude::*;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Score staleness window — 10 minutes (kept as isolated constant, Section 6.3.1).
pub const STALENESS_WINDOW_SECONDS: u64 = 600;

/// Challenge window after a score is posted (same as staleness window for Phase 2).
pub const CHALLENGE_WINDOW_SECONDS: u64 = 600;

/// Minimum arbitration votes needed to resolve a challenge (multi-agent arbitration).
pub const MIN_ARBITRATION_VOTES: u32 = 2;

// ---------------------------------------------------------------------------
// Asset types (AssetNoteRegistry)
// ---------------------------------------------------------------------------

#[odra::odra_type]
pub enum AssetStatus {
    Active,
    Healthy,
    Watchlist,
    Frozen,
    Defaulted,
}

#[odra::odra_type]
pub struct AssetNote {
    pub asset_id: String,
    pub issuer: String,
    pub debtor: String,
    pub face_value: U512,
    pub due_date: u64,
    pub evidence_hash: String,
    pub status: AssetStatus,
    pub current_score: u8,
    pub tranche_released: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

// ---------------------------------------------------------------------------
// Agent types (BondVault)
// ---------------------------------------------------------------------------

#[odra::odra_type]
pub enum AgentRole {
    Parser,
    FraudHeuristic,
    RegistryCheck,
    Aggregator,
    Challenger,
    /// New in Phase 2: third-party verifiers registered via the marketplace.
    ExternalVerifier,
    /// New in Phase 2: insurance underwriting agent.
    InsuranceUnderwriter,
}

#[odra::odra_type]
pub struct AgentRecord {
    pub agent_id: String,
    pub owner: Address,
    pub role: AgentRole,
    pub bonded_amount: U512,
    /// Reputation score — affects challenger pricing and arbitration weight (Phase 2).
    pub reputation: u32,
    pub total_reports: u32,
    pub successful_reports: u32,
    pub slashed_count: u32,
    pub active: bool,
    /// x402 verification price in motes — dynamically discoverable (Phase 2).
    pub x402_price: U512,
}

// ---------------------------------------------------------------------------
// Trust score types (TrustScoreRegistry)
// ---------------------------------------------------------------------------

#[odra::odra_type]
pub struct TrustScore {
    pub score_id: u64,
    pub asset_id: String,
    pub score: u8,
    pub agent_id: String,
    pub evidence_hash: String,
    pub explanation_hash: String,
    pub timestamp: u64,
    pub challenge_deadline: u64,
    pub challenged: bool,
}

// ---------------------------------------------------------------------------
// Challenge types (ChallengeCourt)
// ---------------------------------------------------------------------------

#[odra::odra_type]
pub enum ChallengeStatus {
    Open,
    /// Multi-agent arbitration in progress (Phase 2).
    InArbitration,
    Upheld,
    Rejected,
}

#[odra::odra_type]
pub struct Challenge {
    pub challenge_id: u64,
    pub asset_id: String,
    pub score_id: u64,
    pub challenger_agent_id: String,
    pub challenged_agent_id: String,
    pub counter_evidence_hash: String,
    pub counter_bond: U512,
    pub status: ChallengeStatus,
    pub upheld_votes: u32,
    pub rejected_votes: u32,
    pub opened_at: u64,
    pub resolved_at: u64,
}

// ---------------------------------------------------------------------------
// Vault types (LendingVault)
// ---------------------------------------------------------------------------

#[odra::odra_type]
pub struct VaultPosition {
    pub asset_id: String,
    pub borrower: Address,
    pub collateral_value: U512,
    pub borrowed_amount: U512,
    pub current_ltv: u8,
    pub frozen: bool,
}

// ---------------------------------------------------------------------------
// Covenant types (CovenantEngine)
// ---------------------------------------------------------------------------

#[odra::odra_type]
pub enum CovenantState {
    FullAccess,
    Monitored,
    DrawsFrozen,
    BreachMode,
}

#[odra::odra_type]
pub struct CovenantPolicy {
    pub asset_id: String,
    pub state: CovenantState,
    pub last_score: u8,
    pub updated_at: u64,
}

// ---------------------------------------------------------------------------
// Reserve types (ReserveVault)
// ---------------------------------------------------------------------------

#[odra::odra_type]
pub struct TrancheRecord {
    pub asset_id: String,
    pub tranche_id: u64,
    pub amount: U512,
    pub released: bool,
    pub released_at: u64,
    pub blocked: bool,
}

// ---------------------------------------------------------------------------
// Privacy commitment types (PrivacyCommitmentStore)
// ---------------------------------------------------------------------------

#[odra::odra_type]
pub struct Commitment {
    pub commitment_id: u64,
    pub asset_id: String,
    pub committer: String,
    pub merkle_root: String,
    pub revealed: bool,
    pub reveal_hash: String,
    pub committed_at: u64,
    pub reveal_deadline: u64,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[odra::odra_error]
pub enum Error {
    AssetAlreadyExists = 1,
    AssetNotFound = 2,
    AgentAlreadyRegistered = 3,
    AgentNotFound = 4,
    AgentNotBonded = 5,
    InvalidScore = 6,
    ScoreNotFound = 7,
    ChallengeWindowClosed = 8,
    ChallengeNotFound = 9,
    ChallengeAlreadyResolved = 10,
    NotAuthorized = 11,
    VaultPositionNotFound = 12,
    AssetFrozen = 13,
    ExceedsLtv = 14,
    ScoreStale = 15,
    WrongRole = 16,
    InsufficientVotes = 17,
    CommitmentNotFound = 18,
    AlreadyRevealed = 19,
    RevealWindowClosed = 20,
    TrancheNotFound = 21,
    TrancheAlreadyReleased = 22,
    DrawsFrozen = 23,
    InvalidCommitment = 24,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[odra::event]
pub struct AssetNoteCreated {
    pub asset_id: String,
    pub issuer: String,
    pub face_value: U512,
}

#[odra::event]
pub struct AgentRegistered {
    pub agent_id: String,
    pub role: AgentRole,
}

#[odra::event]
pub struct BondPosted {
    pub agent_id: String,
    pub amount: U512,
}

#[odra::event]
pub struct X402PriceUpdated {
    pub agent_id: String,
    pub new_price: U512,
}

#[odra::event]
pub struct ScoreSubmitted {
    pub asset_id: String,
    pub score: u8,
    pub agent_id: String,
    pub evidence_hash: String,
}

#[odra::event]
pub struct VaultLtvUpdated {
    pub asset_id: String,
    pub new_ltv: u8,
}

#[odra::event]
pub struct ChallengeOpened {
    pub challenge_id: u64,
    pub asset_id: String,
    pub challenger_agent_id: String,
}

#[odra::event]
pub struct ArbitrationVoteCast {
    pub challenge_id: u64,
    pub arbitrator_id: String,
    pub vote_upheld: bool,
}

#[odra::event]
pub struct ChallengeResolved {
    pub challenge_id: u64,
    pub upheld: bool,
}

#[odra::event]
pub struct AgentSlashed {
    pub agent_id: String,
    pub amount: U512,
    pub recipient: String,
}

#[odra::event]
pub struct AssetFrozen {
    pub asset_id: String,
    pub reason: String,
}

#[odra::event]
pub struct CovenantStateChanged {
    pub asset_id: String,
    pub new_state: CovenantState,
    pub score: u8,
}

#[odra::event]
pub struct TrancheReleased {
    pub asset_id: String,
    pub tranche_id: u64,
    pub amount: U512,
}

#[odra::event]
pub struct TrancheBlocked {
    pub asset_id: String,
    pub tranche_id: u64,
    pub reason: String,
}

#[odra::event]
pub struct CommitmentStored {
    pub commitment_id: u64,
    pub asset_id: String,
    pub merkle_root: String,
}

#[odra::event]
pub struct CommitmentRevealed {
    pub commitment_id: u64,
    pub reveal_hash: String,
}

#[odra::event]
pub struct InsurancePolicyIssued {
    pub asset_id: String,
    pub underwriter: String,
    pub premium: U512,
    pub coverage: U512,
}
