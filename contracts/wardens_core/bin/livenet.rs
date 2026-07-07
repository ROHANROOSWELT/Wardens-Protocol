//! Wardens livenet executor — deploys and drives `WardensCore` on a real Casper
//! node using Odra's livenet host. Build/run only with `--features livenet`.
//!
//! Usage:
//!   cargo run --features livenet --bin wardens_livenet -- <command> [args...]
//!
//! Reads Odra livenet env vars (see CHAIN_RUNBOOK.md):
//!   ODRA_CASPER_LIVENET_NODE_ADDRESS, ODRA_CASPER_LIVENET_CHAIN_NAME,
//!   ODRA_CASPER_LIVENET_SECRET_KEY_PATH
//! Non-deploy commands additionally read WARDENS_CORE_ADDRESS (the
//! contract-package address printed by `deploy`).
//!
//! Gas: WARDENS_DEPLOY_GAS (default 300 CSPR) for deploy, WARDENS_GAS
//! (default 10 CSPR) for every other call. Odra logs each deploy/transaction
//! hash and a cspr.live link to stdout — copy those into PROOF.md.

use odra::casper_types::contracts::ContractPackageHash;
use odra::casper_types::{PackageHash, U512};
use odra::host::{Deployer, HostEnv, HostRefLoader};
use odra::prelude::{Address, Addressable};
use odra_casper_livenet_env::env;
use wardens_core::types::{AgentRole, AssetStatus, Challenge, ChallengeStatus, TrustScore};
use wardens_core::{WardensCore, WardensCoreHostRef, WardensCoreInitArgs};

fn nth(i: usize) -> String {
    std::env::args()
        .nth(i)
        .unwrap_or_else(|| panic!("missing positional argument #{i}"))
}

fn opt(i: usize) -> Option<String> {
    std::env::args().nth(i)
}

fn u512(s: &str) -> U512 {
    U512::from(s.parse::<u128>().unwrap_or_else(|_| panic!("bad U512 amount: {s}")))
}

fn call_gas() -> u64 {
    std::env::var("WARDENS_GAS").ok().and_then(|s| s.parse().ok()).unwrap_or(10_000_000_000)
}

fn deploy_gas() -> u64 {
    std::env::var("WARDENS_DEPLOY_GAS").ok().and_then(|s| s.parse().ok()).unwrap_or(300_000_000_000)
}

fn role_from(s: &str) -> AgentRole {
    match s.to_lowercase().as_str() {
        "parser" => AgentRole::Parser,
        "fraud" | "fraudheuristic" => AgentRole::FraudHeuristic,
        "registry" | "registrycheck" => AgentRole::RegistryCheck,
        "aggregator" => AgentRole::Aggregator,
        "challenger" => AgentRole::Challenger,
        other => panic!("unknown role: {other} (parser|fraud|registry|aggregator|challenger)"),
    }
}

fn parse_address(s: &str) -> Address {
    if let Ok(h) = ContractPackageHash::from_formatted_str(s) {
        return Address::from(h);
    }
    if let Ok(h) = PackageHash::from_formatted_str(s) {
        return Address::from(h);
    }
    panic!("cannot parse WARDENS_CORE_ADDRESS: {s} (expected contract-package-… / package-…)");
}

fn load_contract(env: &HostEnv) -> WardensCoreHostRef {
    let s = std::env::var("WARDENS_CORE_ADDRESS")
        .expect("set WARDENS_CORE_ADDRESS to the address printed by `deploy`");
    WardensCore::load(env, parse_address(&s))
}

fn status_str(s: &AssetStatus) -> &'static str {
    match s {
        AssetStatus::Active => "Active",
        AssetStatus::Healthy => "Healthy",
        AssetStatus::Watchlist => "Watchlist",
        AssetStatus::Frozen => "Frozen",
        AssetStatus::Defaulted => "Defaulted",
    }
}

fn challenge_status_str(s: &ChallengeStatus) -> &'static str {
    match s {
        ChallengeStatus::Open => "Open",
        ChallengeStatus::Upheld => "Upheld",
        ChallengeStatus::Rejected => "Rejected",
    }
}

fn role_str(r: &AgentRole) -> &'static str {
    match r {
        AgentRole::Parser => "Parser",
        AgentRole::FraudHeuristic => "FraudHeuristic",
        AgentRole::RegistryCheck => "RegistryCheck",
        AgentRole::Aggregator => "Aggregator",
        AgentRole::Challenger => "Challenger",
    }
}

/// Minimal JSON string escaping (our data has no control chars).
fn jstr(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn print_score(s: &TrustScore) {
    println!(
        "SCORE score_id={} asset={} score={} agent={} challenged={} deadline={}",
        s.score_id, s.asset_id, s.score, s.agent_id, s.challenged, s.challenge_deadline
    );
}

fn print_challenge(c: &Challenge) {
    println!(
        "CHALLENGE id={} asset={} score_id={} challenger={} challenged={} status={} counter_bond={}",
        c.challenge_id,
        c.asset_id,
        c.score_id,
        c.challenger_agent_id,
        c.challenged_agent_id,
        challenge_status_str(&c.status),
        c.counter_bond
    );
}

pub fn main() {
    let env = env();
    let command = std::env::args().nth(1).unwrap_or_default();

    match command.as_str() {
        // -------- deploy --------
        "deploy" => {
            // Admin = the funded deployer account (env.caller()), matching the
            // Section 6.6 access model (admin/backend wallet).
            let admin = env.caller();
            env.set_gas(deploy_gas());
            let contract = WardensCore::deploy(&env, WardensCoreInitArgs { admin });
            println!("CONTRACT_ADDRESS={}", contract.address().to_formatted_string());
            println!("ADMIN_ACCOUNT={}", admin.to_formatted_string());
            println!("Copy CONTRACT_ADDRESS into WARDENS_CORE_ADDRESS (and PROOF.md).");
        }

        // -------- mutating entrypoints --------
        "create_asset" => {
            // create_asset <asset_id> <issuer> <debtor> <face_value> <due_date> <evidence_hash>
            let mut c = load_contract(&env);
            env.set_gas(call_gas());
            c.create_asset(nth(2), nth(3), nth(4), u512(&nth(5)), nth(6).parse().unwrap(), nth(7));
            println!("OK create_asset {}", nth(2));
        }
        "register_agent" => {
            // register_agent <agent_id> <role>
            let mut c = load_contract(&env);
            env.set_gas(call_gas());
            c.register_agent(nth(2), role_from(&nth(3)));
            println!("OK register_agent {} ({})", nth(2), nth(3));
        }
        "post_bond" => {
            // post_bond <agent_id> <amount>
            let mut c = load_contract(&env);
            env.set_gas(call_gas());
            c.post_bond(nth(2), u512(&nth(3)));
            println!("OK post_bond {} {}", nth(2), nth(3));
        }
        "submit_score" => {
            // submit_score <asset_id> <score> <agent_id> <evidence_hash> <explanation_hash>
            let mut c = load_contract(&env);
            env.set_gas(call_gas());
            let id = c.submit_score(nth(2), nth(3).parse().unwrap(), nth(4), nth(5), nth(6));
            println!("SCORE_ID={id}");
        }
        "deposit_collateral" => {
            // deposit_collateral <asset_id> <collateral_value>
            let mut c = load_contract(&env);
            env.set_gas(call_gas());
            c.deposit_collateral(nth(2), u512(&nth(3)));
            println!("OK deposit_collateral {} {}", nth(2), nth(3));
        }
        "borrow" => {
            // borrow <asset_id> <amount>
            let mut c = load_contract(&env);
            env.set_gas(call_gas());
            c.borrow(nth(2), u512(&nth(3)));
            println!("OK borrow {} {}", nth(2), nth(3));
        }
        "open_challenge" => {
            // open_challenge <score_id> <challenger_agent_id> <counter_evidence_hash> <counter_bond>
            let mut c = load_contract(&env);
            env.set_gas(call_gas());
            let id = c.open_challenge(nth(2).parse().unwrap(), nth(3), nth(4), u512(&nth(5)));
            println!("CHALLENGE_ID={id}");
        }
        "resolve_challenge" => {
            // resolve_challenge <challenge_id> <upheld:true|false>
            let mut c = load_contract(&env);
            env.set_gas(call_gas());
            c.resolve_challenge(nth(2).parse().unwrap(), nth(3).parse().unwrap());
            println!("OK resolve_challenge {} upheld={}", nth(2), nth(3));
        }

        // -------- reads (use the proxy caller; cost a little gas on livenet) --------
        "get_asset" => {
            let c = load_contract(&env);
            env.set_gas(call_gas());
            let a = c.get_asset(nth(2));
            println!(
                "ASSET id={} status={} score={} issuer={} debtor={} face_value={}",
                a.asset_id, status_str(&a.status), a.current_score, a.issuer, a.debtor, a.face_value
            );
        }
        "current_ltv" => {
            let c = load_contract(&env);
            env.set_gas(call_gas());
            println!("LTV {} = {}%", nth(2), c.current_ltv(nth(2)));
        }
        "get_agent" => {
            let c = load_contract(&env);
            env.set_gas(call_gas());
            let a = c.get_agent(nth(2));
            println!(
                "AGENT id={} bond={} reputation={} slashed_count={} active={} reports={}/{}",
                a.agent_id, a.bonded_amount, a.reputation, a.slashed_count, a.active,
                a.successful_reports, a.total_reports
            );
        }
        "get_score" => {
            let c = load_contract(&env);
            env.set_gas(call_gas());
            print_score(&c.get_score(nth(2).parse().unwrap()));
        }
        "get_challenge" => {
            let c = load_contract(&env);
            env.set_gas(call_gas());
            print_challenge(&c.get_challenge(nth(2).parse().unwrap()));
        }
        "get_challenge_count" => {
            let c = load_contract(&env);
            env.set_gas(call_gas());
            println!("CHALLENGE_COUNT={}", c.get_challenge_count());
        }

        // Read everything the dashboard needs for one asset in a single process and
        // emit it as one JSON line prefixed with `DUMP `. Used by the backend's
        // chain mode to populate the live dashboard.
        "dump" => {
            let c = load_contract(&env);
            env.set_gas(call_gas());
            let asset_id = nth(2);

            let asset_json = match c.try_get_asset(asset_id.clone()) {
                Ok(a) => format!(
                    "{{\"asset_id\":\"{}\",\"status\":\"{}\",\"score\":{},\"issuer\":\"{}\",\"debtor\":\"{}\",\"face_value\":\"{}\"}}",
                    jstr(&a.asset_id), status_str(&a.status), a.current_score,
                    jstr(&a.issuer), jstr(&a.debtor), a.face_value
                ),
                Err(_) => "null".to_string(),
            };

            let count = c.try_get_challenge_count().unwrap_or(0);
            let mut challenges: Vec<String> = Vec::new();
            for id in 1..=count {
                if let Ok(ch) = c.try_get_challenge(id) {
                    if ch.asset_id == asset_id {
                        challenges.push(format!(
                            "{{\"challenge_id\":{},\"asset_id\":\"{}\",\"challenger_agent_id\":\"{}\",\"challenged_agent_id\":\"{}\",\"counter_bond\":\"{}\",\"status\":\"{}\"}}",
                            ch.challenge_id, jstr(&ch.asset_id), jstr(&ch.challenger_agent_id),
                            jstr(&ch.challenged_agent_id), ch.counter_bond, challenge_status_str(&ch.status)
                        ));
                    }
                }
            }

            let mut agents: Vec<String> = Vec::new();
            for aid in ["aggregator-agent-1", "challenger-agent-1"] {
                if let Ok(a) = c.try_get_agent(aid.to_string()) {
                    agents.push(format!(
                        "{{\"agent_id\":\"{}\",\"role\":\"{}\",\"bonded_amount\":\"{}\",\"reputation\":{},\"total_reports\":{},\"successful_reports\":{},\"slashed_count\":{},\"active\":{}}}",
                        jstr(&a.agent_id), role_str(&a.role), a.bonded_amount, a.reputation,
                        a.total_reports, a.successful_reports, a.slashed_count, a.active
                    ));
                }
            }

            println!(
                "DUMP {{\"asset\":{},\"agents\":[{}],\"challenges\":[{}]}}",
                asset_json, agents.join(","), challenges.join(",")
            );
        }

        other => {
            eprintln!(
                "unknown command: '{other}'. Commands: deploy | create_asset | register_agent | \
                 post_bond | submit_score | deposit_collateral | borrow | open_challenge | \
                 resolve_challenge | get_asset | current_ltv | get_agent | get_score | \
                 get_challenge | get_challenge_count"
            );
            let _ = opt(0);
            std::process::exit(2);
        }
    }
}
