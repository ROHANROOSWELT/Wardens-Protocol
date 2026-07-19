//! Phase 2 contract tests — all 8 modules.
//! Run with: cargo odra test

#[cfg(test)]
mod tests {
    use crate::asset_note_registry::{AssetNoteRegistry, AssetNoteRegistryInitArgs};
    use crate::bond_vault::{BondVault, BondVaultInitArgs};
    use crate::challenge_court::{ChallengeCourt, ChallengeCourtInitArgs};
    use crate::covenant_engine::{CovenantEngine, CovenantEngineInitArgs};
    use crate::lending_vault::{LendingVault, LendingVaultInitArgs};
    use crate::reserve_vault::{ReserveVault, ReserveVaultInitArgs};
    use crate::trust_score_registry::{TrustScoreRegistry, TrustScoreRegistryInitArgs};
    use crate::privacy_commitment_store::{PrivacyCommitmentStore, PrivacyCommitmentStoreInitArgs};
    use crate::types::*;
    use odra::casper_types::U512;
    use odra::host::{Deployer, HostEnv};

    fn u(n: u64) -> U512 { U512::from(n) }

    // ---- AssetNoteRegistry ----

    #[test]
    fn asset_create_and_retrieve() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut reg = AssetNoteRegistry::deploy(&env, AssetNoteRegistryInitArgs { admin });
        reg.create_asset_note("INV-P2-001".into(), "ABC Traders".into(), "RetailMart Ltd".into(), u(1000), 1783728000, "sha256:abc".into());
        let note = reg.get_asset_note("INV-P2-001".into());
        assert_eq!(note.issuer, "ABC Traders");
        assert_eq!(note.current_score, 0);
        assert!(matches!(note.status, AssetStatus::Active));
    }

    #[test]
    #[should_panic]
    fn asset_duplicate_rejected() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut reg = AssetNoteRegistry::deploy(&env, AssetNoteRegistryInitArgs { admin });
        reg.create_asset_note("DUP".into(), "A".into(), "B".into(), u(1), 1, "h".into());
        reg.create_asset_note("DUP".into(), "A".into(), "B".into(), u(1), 1, "h".into());
    }

    #[test]
    fn score_update_changes_status() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut reg = AssetNoteRegistry::deploy(&env, AssetNoteRegistryInitArgs { admin });
        reg.create_asset_note("INV-P2-002".into(), "A".into(), "B".into(), u(1000), 1, "h".into());
        reg.update_asset_score("INV-P2-002".into(), 92);
        let note = reg.get_asset_note("INV-P2-002".into());
        assert_eq!(note.current_score, 92);
        assert!(matches!(note.status, AssetStatus::Healthy));
    }

    // ---- TrustScoreRegistry ----

    #[test]
    fn record_score_and_retrieve() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut reg = TrustScoreRegistry::deploy(&env, TrustScoreRegistryInitArgs { admin });
        let sid = reg.record_score("INV-P2-001".into(), 88, "aggregator-agent-1".into(), "evhash".into(), "explhash".into());
        assert_eq!(sid, 1);
        let ts = reg.get_score(sid);
        assert_eq!(ts.score, 88);
        assert_eq!(reg.get_latest_score_id("INV-P2-001".into()), 1);
    }

    #[test]
    #[should_panic]
    fn invalid_score_rejected() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut reg = TrustScoreRegistry::deploy(&env, TrustScoreRegistryInitArgs { admin });
        reg.record_score("INV-P2-001".into(), 101, "agent".into(), "e".into(), "x".into());
    }

    // ---- BondVault ----

    #[test]
    fn register_and_bond_agent() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut vault = BondVault::deploy(&env, BondVaultInitArgs { admin });
        vault.register_agent("aggregator-agent-1".into(), AgentRole::Aggregator);
        vault.post_bond("aggregator-agent-1".into(), u(10));
        assert!(vault.is_bonded("aggregator-agent-1".into()));
    }

    #[test]
    #[should_panic]
    fn duplicate_agent_rejected() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut vault = BondVault::deploy(&env, BondVaultInitArgs { admin });
        vault.register_agent("agent-x".into(), AgentRole::Parser);
        vault.register_agent("agent-x".into(), AgentRole::Parser);
    }

    #[test]
    fn external_verifier_registration() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut vault = BondVault::deploy(&env, BondVaultInitArgs { admin });
        vault.register_external_verifier("ext-verifier-1".into(), u(5), u(1_000_000));
        let agent = vault.get_agent("ext-verifier-1".into());
        assert!(matches!(agent.role, AgentRole::ExternalVerifier));
        assert_eq!(agent.x402_price, u(1_000_000));
    }

    #[test]
    fn dynamic_x402_price_update() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut vault = BondVault::deploy(&env, BondVaultInitArgs { admin });
        vault.register_agent("fraud-agent-1".into(), AgentRole::FraudHeuristic);
        vault.update_x402_price("fraud-agent-1".into(), u(2_000_000));
        let agent = vault.get_agent("fraud-agent-1".into());
        assert_eq!(agent.x402_price, u(2_000_000));
    }

    #[test]
    fn slash_agent() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut vault = BondVault::deploy(&env, BondVaultInitArgs { admin });
        vault.register_agent("bad-agent".into(), AgentRole::Aggregator);
        vault.post_bond("bad-agent".into(), u(10));
        vault.register_agent("challenger-agent-1".into(), AgentRole::Challenger);
        vault.slash_agent("bad-agent".into(), "challenger-agent-1".into());
        let bad = vault.get_agent("bad-agent".into());
        assert_eq!(bad.bonded_amount, U512::zero());
        assert!(!bad.active);
        assert_eq!(bad.slashed_count, 1);
    }

    // ---- ChallengeCourt ----

    #[test]
    fn open_challenge_and_vote_auto_resolve() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut court = ChallengeCourt::deploy(&env, ChallengeCourtInitArgs { admin });
        let cid = court.open_challenge(1, "INV-P2-001".into(), "bad-agent".into(), "challenger-1".into(), "hash".into(), u(5));
        assert_eq!(cid, 1);
        let resolved1 = court.cast_vote(cid, "arb-1".into(), true);
        assert!(!resolved1);
        let resolved2 = court.cast_vote(cid, "arb-2".into(), true);
        assert!(resolved2);
        let ch = court.get_challenge(cid);
        assert!(matches!(ch.status, ChallengeStatus::Upheld));
    }

    #[test]
    fn force_resolve_by_admin() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut court = ChallengeCourt::deploy(&env, ChallengeCourtInitArgs { admin });
        let cid = court.open_challenge(1, "INV-P2-X".into(), "bad".into(), "ch".into(), "h".into(), u(1));
        court.force_resolve(cid, false);
        let ch = court.get_challenge(cid);
        assert!(matches!(ch.status, ChallengeStatus::Rejected));
    }

    // ---- CovenantEngine ----

    #[test]
    fn covenant_full_access_at_85() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut engine = CovenantEngine::deploy(&env, CovenantEngineInitArgs { admin });
        engine.update_policy("INV-P2-001".into(), 90);
        assert!(engine.is_tranche_release_allowed("INV-P2-001".into()));
        assert!(!engine.are_draws_frozen("INV-P2-001".into()));
    }

    #[test]
    fn covenant_draws_frozen_below_70() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut engine = CovenantEngine::deploy(&env, CovenantEngineInitArgs { admin });
        engine.update_policy("INV-P2-001".into(), 60);
        assert!(engine.are_draws_frozen("INV-P2-001".into()));
    }

    #[test]
    fn covenant_breach_below_50() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut engine = CovenantEngine::deploy(&env, CovenantEngineInitArgs { admin });
        let state = engine.update_policy("INV-P2-001".into(), 30);
        assert!(matches!(state, CovenantState::BreachMode));
    }

    // ---- LendingVault ----

    #[test]
    fn deposit_and_borrow_within_ltv() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut vault = LendingVault::deploy(&env, LendingVaultInitArgs { admin });
        vault.deposit_collateral("INV-P2-001".into(), u(1000));
        vault.apply_ltv("INV-P2-001".into(), 92, false);
        assert_eq!(vault.current_ltv("INV-P2-001".into()), 75);
        vault.borrow("INV-P2-001".into(), u(700));
    }

    #[test]
    #[should_panic]
    fn borrow_rejected_if_ltv_exceeded() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut vault = LendingVault::deploy(&env, LendingVaultInitArgs { admin });
        vault.deposit_collateral("INV-P2-001".into(), u(1000));
        vault.apply_ltv("INV-P2-001".into(), 92, false);
        vault.borrow("INV-P2-001".into(), u(800));
    }

    #[test]
    #[should_panic]
    fn borrow_rejected_if_frozen() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut vault = LendingVault::deploy(&env, LendingVaultInitArgs { admin });
        vault.deposit_collateral("INV-P2-001".into(), u(1000));
        vault.apply_ltv("INV-P2-001".into(), 30, false);
        vault.borrow("INV-P2-001".into(), u(100));
    }

    #[test]
    #[should_panic]
    fn borrow_rejected_if_draws_frozen_by_covenant() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut vault = LendingVault::deploy(&env, LendingVaultInitArgs { admin });
        vault.deposit_collateral("INV-P2-001".into(), u(1000));
        vault.apply_ltv("INV-P2-001".into(), 88, true);
        vault.borrow("INV-P2-001".into(), u(100));
    }

    // ---- ReserveVault ----

    #[test]
    fn create_and_release_tranche() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut rv = ReserveVault::deploy(&env, ReserveVaultInitArgs { admin });
        let tid = rv.create_tranche("INV-P2-001".into(), u(500));
        rv.release_tranche(tid, true);
        let tr = rv.get_tranche(tid);
        assert!(tr.released);
    }

    #[test]
    #[should_panic]
    fn release_tranche_blocked_if_not_allowed() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut rv = ReserveVault::deploy(&env, ReserveVaultInitArgs { admin });
        let tid = rv.create_tranche("INV-P2-001".into(), u(500));
        rv.release_tranche(tid, false);
    }

    // ---- PrivacyCommitmentStore ----

    #[test]
    fn store_and_reveal_commitment() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut store = PrivacyCommitmentStore::deploy(&env, PrivacyCommitmentStoreInitArgs { admin });
        let cid = store.store_commitment("INV-P2-001".into(), "agent-1".into(), "sha256:merkleroot".into());
        store.reveal_commitment(cid, "sha256:merkleroot".into());
        let c = store.get_commitment(cid);
        assert!(c.revealed);
    }

    #[test]
    #[should_panic]
    fn reveal_wrong_hash_rejected() {
        let env = odra_test::env();
        let admin = env.get_account(0);
        env.set_caller(admin);
        let mut store = PrivacyCommitmentStore::deploy(&env, PrivacyCommitmentStoreInitArgs { admin });
        let cid = store.store_commitment("INV-P2-001".into(), "a".into(), "root1".into());
        store.reveal_commitment(cid, "wrong-hash".into());
    }
}
