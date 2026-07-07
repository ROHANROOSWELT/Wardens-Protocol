//! Data models, enums, errors, events and constants for `WardensCore`.
//!
//! Section 6.2 of the build spec is the source of truth for the fields below.
//! On-chain storage layout is an implementation detail (Section 6.8): custom
//! types are stored directly using Odra's `#[odra::odra_type]` derive.

use odra::casper_types::U512;
use odra::prelude::*;

/// Trust scores go stale after 10 minutes (Section 6.3.1). Kept as an isolated,
/// named constant so making it per-asset-class later is a one-line change.
pub const STALENESS_WINDOW_SECONDS: u64 = 600;

// ---------------------------------------------------------------------------
// Asset
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
pub struct Asset {
    pub asset_id: String,
    pub issuer: String,
    pub debtor: String,
    pub face_value: U512,
    pub due_date: u64,
    pub evidence_hash: String,
    pub status: AssetStatus,
    pub current_score: u8,
    pub created_at: u64,
    pub updated_at: u64,
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

#[odra::odra_type]
pub enum AgentRole {
    Parser,
    FraudHeuristic,
    RegistryCheck,
    Aggregator,
    Challenger,
}

#[odra::odra_type]
pub struct Agent {
    pub agent_id: String,
    pub owner: Address,
    pub role: AgentRole,
    pub bonded_amount: U512,
    pub reputation: u32,
    pub total_reports: u32,
    pub successful_reports: u32,
    pub slashed_count: u32,
    pub active: bool,
}

// ---------------------------------------------------------------------------
// Trust score
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
// Challenge
// ---------------------------------------------------------------------------

#[odra::odra_type]
pub enum ChallengeStatus {
    Open,
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
    pub opened_at: u64,
    pub resolved_at: u64,
}

// ---------------------------------------------------------------------------
// Vault
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
}

// ---------------------------------------------------------------------------
// Events (Section 6.4) — the dashboard timeline depends on these.
// ---------------------------------------------------------------------------

#[odra::event]
pub struct AssetCreated {
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
