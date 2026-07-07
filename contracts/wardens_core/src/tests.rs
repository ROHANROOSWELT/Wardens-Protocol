//! Local Odra tests for `WardensCore` (Section 13 contract + e2e cases).
//! Run with `cargo odra test`. These must pass before any testnet deploy.

use crate::types::*;
use crate::vault::ltv_for_score;
use crate::{WardensCore, WardensCoreHostRef, WardensCoreInitArgs};
use odra::casper_types::U512;
use odra::host::{Deployer, HostEnv, HostRef};

fn u(n: u64) -> U512 {
    U512::from(n)
}

fn setup() -> (HostEnv, WardensCoreHostRef) {
    let env = odra_test::env();
    let admin = env.get_account(0);
    let contract = WardensCore::deploy(&env, WardensCoreInitArgs { admin });
    (env, contract)
}

/// create asset + register a bonded aggregator agent, ready to submit scores.
fn setup_ready() -> (HostEnv, WardensCoreHostRef) {
    let (env, mut c) = setup();
    c.create_asset(
        "INV-001".into(),
        "ABC Traders".into(),
        "RetailMart Ltd".into(),
        u(1000),
        1783728000,
        "evhash".into(),
    );
    c.register_agent("aggregator-agent-1".into(), AgentRole::Aggregator);
    c.post_bond("aggregator-agent-1".into(), u(10));
    (env, c)
}

#[test]
fn asset_creation_works() {
    let (_e, mut c) = setup();
    c.create_asset("INV-001".into(), "ABC".into(), "Retail".into(), u(1000), 1, "h".into());
    let a = c.get_asset("INV-001".into());
    assert_eq!(a.current_score, 0);
    assert!(a.status == AssetStatus::Active);
}

#[test]
fn duplicate_asset_rejected() {
    let (_e, mut c) = setup();
    c.create_asset("INV-001".into(), "ABC".into(), "Retail".into(), u(1000), 1, "h".into());
    assert!(c
        .try_create_asset("INV-001".into(), "ABC".into(), "Retail".into(), u(1000), 1, "h".into())
        .is_err());
}

#[test]
fn unbonded_agent_cannot_submit_score() {
    let (_e, mut c) = setup();
    c.create_asset("INV-001".into(), "ABC".into(), "Retail".into(), u(1000), 1, "h".into());
    c.register_agent("agg".into(), AgentRole::Aggregator); // registered, not bonded
    let r = c.try_submit_score("INV-001".into(), 92, "agg".into(), "e".into(), "x".into());
    assert!(r.is_err());
}

#[test]
fn bonded_agent_can_submit_score_and_updates_ltv() {
    let (_e, mut c) = setup_ready();
    c.submit_score("INV-001".into(), 92, "aggregator-agent-1".into(), "e".into(), "x".into());
    assert_eq!(c.get_current_score("INV-001".into()), 92);
    assert_eq!(c.current_ltv("INV-001".into()), 75);
    assert!(c.get_asset("INV-001".into()).status == AssetStatus::Healthy);
}

#[test]
fn low_score_freezes_asset() {
    let (_e, mut c) = setup_ready();
    c.submit_score("INV-001".into(), 38, "aggregator-agent-1".into(), "e".into(), "x".into());
    assert!(c.get_asset("INV-001".into()).status == AssetStatus::Frozen);
    assert_eq!(c.current_ltv("INV-001".into()), 0);
}

#[test]
fn borrow_within_ltv_succeeds_and_exceeding_rejected() {
    let (_e, mut c) = setup_ready();
    c.submit_score("INV-001".into(), 92, "aggregator-agent-1".into(), "e".into(), "x".into());
    c.deposit_collateral("INV-001".into(), u(1000));
    c.borrow("INV-001".into(), u(700)); // 75% of 1000 = 750, ok
    assert!(c.try_borrow("INV-001".into(), u(100)).is_err()); // would exceed 750
}

#[test]
fn borrow_rejected_when_frozen() {
    let (_e, mut c) = setup_ready();
    c.submit_score("INV-001".into(), 92, "aggregator-agent-1".into(), "e".into(), "x".into());
    c.deposit_collateral("INV-001".into(), u(1000));
    // A second low score freezes the asset.
    c.submit_score("INV-001".into(), 30, "aggregator-agent-1".into(), "e".into(), "x".into());
    assert!(c.try_borrow("INV-001".into(), u(1)).is_err());
}

#[test]
fn stale_score_blocks_borrow() {
    let (env, mut c) = setup_ready();
    c.submit_score("INV-001".into(), 92, "aggregator-agent-1".into(), "e".into(), "x".into());
    c.deposit_collateral("INV-001".into(), u(1000));
    env.advance_block_time(700_000); // > 600s window
    assert_eq!(c.current_ltv("INV-001".into()), 0);
    assert!(c.try_borrow("INV-001".into(), u(1)).is_err());
}

#[test]
fn challenge_upheld_slashes_verifier_and_freezes() {
    let (_e, mut c) = setup_ready();
    c.create_asset("INV-003".into(), "Fake".into(), "Unknown".into(), u(2500), 1, "h".into());
    c.register_agent("challenger-agent-1".into(), AgentRole::Challenger);
    c.post_bond("challenger-agent-1".into(), u(5));

    // Verifier posts an over-optimistic score of 90.
    let score_id =
        c.submit_score("INV-003".into(), 90, "aggregator-agent-1".into(), "e".into(), "x".into());
    assert!(c.get_agent("aggregator-agent-1".into()).bonded_amount > U512::zero());

    // Challenger disputes it, posting a counter-bond.
    let ch_id = c.open_challenge(score_id, "challenger-agent-1".into(), "counter".into(), u(5));
    // Admin resolves the challenge as upheld.
    c.resolve_challenge(ch_id, true);

    // Bad verifier slashed to zero, asset frozen, challenge marked Upheld.
    assert_eq!(c.get_agent("aggregator-agent-1".into()).bonded_amount, U512::zero());
    assert_eq!(c.get_agent("aggregator-agent-1".into()).slashed_count, 1);
    assert!(c.get_asset("INV-003".into()).status == AssetStatus::Frozen);
    assert!(c.get_challenge(ch_id).status == ChallengeStatus::Upheld);
}

#[test]
fn challenge_rejected_slashes_challenger() {
    let (_e, mut c) = setup_ready();
    c.register_agent("challenger-agent-1".into(), AgentRole::Challenger);
    c.post_bond("challenger-agent-1".into(), u(5));
    let score_id =
        c.submit_score("INV-001".into(), 92, "aggregator-agent-1".into(), "e".into(), "x".into());
    let ch_id = c.open_challenge(score_id, "challenger-agent-1".into(), "counter".into(), u(5));
    c.resolve_challenge(ch_id, false);
    // Challenger loses its counter-bond; asset stays healthy.
    assert_eq!(c.get_agent("challenger-agent-1".into()).bonded_amount, U512::zero());
    assert!(c.get_asset("INV-001".into()).status == AssetStatus::Healthy);
    assert!(c.get_challenge(ch_id).status == ChallengeStatus::Rejected);
}

#[test]
fn non_challenger_role_cannot_open_challenge() {
    let (_e, mut c) = setup_ready();
    // Register a second aggregator (wrong role) and bond it.
    c.register_agent("agg2".into(), AgentRole::Aggregator);
    c.post_bond("agg2".into(), u(5));
    let score_id =
        c.submit_score("INV-001".into(), 92, "aggregator-agent-1".into(), "e".into(), "x".into());
    assert!(c
        .try_open_challenge(score_id, "agg2".into(), "counter".into(), u(5))
        .is_err());
}

#[test]
fn ltv_table_matches_spec() {
    assert_eq!(ltv_for_score(95), 75);
    assert_eq!(ltv_for_score(90), 75);
    assert_eq!(ltv_for_score(80), 60);
    assert_eq!(ltv_for_score(65), 40);
    assert_eq!(ltv_for_score(55), 20);
    assert_eq!(ltv_for_score(49), 0);
}
