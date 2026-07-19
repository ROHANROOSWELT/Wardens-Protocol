// wardens_phase2_livenet — Phase 2 chain interaction binary.

use odra_casper_livenet_env::env;
use odra::prelude::Addressable;
use odra::host::Deployer;
use std::env as std_env;

use wardens_phase2::asset_note_registry::{AssetNoteRegistry, AssetNoteRegistryInitArgs};
use wardens_phase2::trust_score_registry::{TrustScoreRegistry, TrustScoreRegistryInitArgs};
use wardens_phase2::bond_vault::{BondVault, BondVaultInitArgs};
use wardens_phase2::challenge_court::{ChallengeCourt, ChallengeCourtInitArgs};
use wardens_phase2::lending_vault::{LendingVault, LendingVaultInitArgs};
use wardens_phase2::covenant_engine::{CovenantEngine, CovenantEngineInitArgs};
use wardens_phase2::reserve_vault::{ReserveVault, ReserveVaultInitArgs};
use wardens_phase2::privacy_commitment_store::{PrivacyCommitmentStore, PrivacyCommitmentStoreInitArgs};
use odra::casper_types::contracts::ContractPackageHash;
use odra::casper_types::PackageHash;
use odra::prelude::Address;
use odra::host::HostRefLoader;

fn parse_address(s: &str) -> Address {
    if let Ok(h) = ContractPackageHash::from_formatted_str(s) {
        return Address::from(h);
    }
    if let Ok(h) = PackageHash::from_formatted_str(s) {
        return Address::from(h);
    }
    panic!("cannot parse Address: {s}");
}

fn main() {
    let args: Vec<String> = std_env::args().collect();
    if args.len() < 2 {
        println!("Usage: wardens_phase2_livenet <command> [args]");
        return;
    }

    let command = &args[1];
    
    // Initialize Livenet Environment
    let env = odra_casper_livenet_env::env();
    env.set_gas(300_000_000_000u64);
    let admin = env.get_account(0);

    if command == "deploy" {
        if args.len() < 3 {
            println!("Usage: deploy <ContractName>");
            return;
        }
        let contract_name = &args[2];
        match contract_name.as_str() {
            "AssetNoteRegistry" => {
                let contract = AssetNoteRegistry::deploy(&env, AssetNoteRegistryInitArgs { admin });
                println!("Deployed AssetNoteRegistry: {}", contract.address().to_string());
            }
            "TrustScoreRegistry" => {
                let contract = TrustScoreRegistry::deploy(&env, TrustScoreRegistryInitArgs { admin });
                println!("Deployed TrustScoreRegistry: {}", contract.address().to_string());
            }
            "BondVault" => {
                let contract = BondVault::deploy(&env, BondVaultInitArgs { admin });
                println!("Deployed BondVault: {}", contract.address().to_string());
            }
            "ChallengeCourt" => {
                let contract = ChallengeCourt::deploy(&env, ChallengeCourtInitArgs { admin });
                println!("Deployed ChallengeCourt: {}", contract.address().to_string());
            }
            "LendingVault" => {
                let contract = LendingVault::deploy(&env, LendingVaultInitArgs { admin });
                println!("Deployed LendingVault: {}", contract.address().to_string());
            }
            "CovenantEngine" => {
                let contract = CovenantEngine::deploy(&env, CovenantEngineInitArgs { admin });
                println!("Deployed CovenantEngine: {}", contract.address().to_string());
            }
            "ReserveVault" => {
                let contract = ReserveVault::deploy(&env, ReserveVaultInitArgs { admin });
                println!("Deployed ReserveVault: {}", contract.address().to_string());
            }
            "PrivacyCommitmentStore" => {
                let contract = PrivacyCommitmentStore::deploy(&env, PrivacyCommitmentStoreInitArgs { admin });
                println!("Deployed PrivacyCommitmentStore: {}", contract.address().to_string());
            }
            _ => {
                println!("Unknown contract: {}", contract_name);
            }
        }
        return;
    }

    // Call routing (Phase 2 backend orchestrator uses these)
    if command == "call" {
        if args.len() < 5 {
            println!("Usage: call <ContractName> <ContractHash> <Method> [Args...]");
            return;
        }
        let contract_name = &args[2];
        let contract_hash = parse_address(&args[3]);
        let method = &args[4];
        
        env.set_gas(50_000_000_000u64); // 50 CSPR for calls
        
        match (contract_name.as_str(), method.as_str()) {
            ("ReserveVault", "create_tranche") => {
                let mut c = wardens_phase2::reserve_vault::ReserveVault::load(&env, contract_hash);
                let id = c.create_tranche(args[5].clone(), odra::casper_types::U512::from_dec_str(&args[6]).unwrap());
                println!("TRANCHE_ID={}", id);
            }
            ("ReserveVault", "release_tranche") => {
                let mut c = wardens_phase2::reserve_vault::ReserveVault::load(&env, contract_hash);
                c.release_tranche(args[5].parse().unwrap(), args[6].parse().unwrap());
                println!("STATUS: OK");
            }
            ("PrivacyCommitmentStore", "store_commitment") => {
                let mut c = wardens_phase2::privacy_commitment_store::PrivacyCommitmentStore::load(&env, contract_hash);
                let id = c.store_commitment(args[5].clone(), args[6].clone(), args[7].clone());
                println!("COMMITMENT_ID={}", id);
            }
            ("PrivacyCommitmentStore", "reveal_commitment") => {
                let mut c = wardens_phase2::privacy_commitment_store::PrivacyCommitmentStore::load(&env, contract_hash);
                c.reveal_commitment(args[5].parse().unwrap(), args[6].clone());
                println!("STATUS: OK");
            }
            _ => {
                println!("Unsupported call or method");
            }
        }
        return;
    }
}
