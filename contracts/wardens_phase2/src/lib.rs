//! Wardens Protocol Phase 2 — shared types, events, and errors.
//!
//! Phase 2 splits WardensCore into five independent contracts and adds three
//! new modules: CovenantEngine, ReserveVault, and PrivacyCommitmentStore.
//! Every entrypoint that crossed module boundaries in Phase 1 now goes through
//! the backend orchestrator, which calls each contract in sequence.

#![cfg_attr(not(test), no_std)]
#![cfg_attr(not(test), no_main)]
extern crate alloc;

pub mod types;
pub mod asset_note_registry;
pub mod trust_score_registry;
pub mod bond_vault;
pub mod challenge_court;
pub mod lending_vault;
pub mod covenant_engine;
pub mod reserve_vault;
pub mod privacy_commitment_store;

#[cfg(test)]
mod tests;
