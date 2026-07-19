//! BondVault — Phase 2 split: agent registration + bond accounting.
//!
//! Phase 2 upgrades: agents can self-register (not admin-only), third-party
//! verifiers join via a marketplace deposit, and every agent has a dynamic
//! x402_price that the aggregator reads before paying.

use crate::types::*;
use odra::casper_types::U512;
use odra::prelude::*;

#[odra::module(events = [AgentRegistered, BondPosted, AgentSlashed, X402PriceUpdated])]
pub struct BondVault {
    admin: Var<Address>,
    agents: Mapping<String, AgentRecord>,
    /// Minimum bond required to register as an external verifier (Phase 2).
    min_external_bond: Var<U512>,
}

#[odra::module]
impl BondVault {
    pub fn init(&mut self, admin: Address) {
        self.admin.set(admin);
        // Default min bond for external verifiers: 5 CSPR (testnet accounting).
        self.min_external_bond.set(U512::from(5u64));
    }

    fn require_admin(&self) {
        if self.env().caller() != self.admin.get_or_revert_with(Error::NotAuthorized) {
            self.env().revert(Error::NotAuthorized);
        }
    }

    fn require_owner_or_admin(&self, agent: &AgentRecord) {
        let caller = self.env().caller();
        let admin = self.admin.get_or_revert_with(Error::NotAuthorized);
        if caller != agent.owner && caller != admin {
            self.env().revert(Error::NotAuthorized);
        }
    }

    // ---- Admin: register core agents ----

    pub fn register_agent(&mut self, agent_id: String, role: AgentRole) {
        self.require_admin();
        self.internal_register(agent_id, role, U512::from(1_000_000u64));
    }

    // ---- Phase 2: self-register as external verifier ----

    /// Any party can register as an ExternalVerifier by paying the minimum bond.
    /// The bond is accounted internally (simulated purse — Phase 2 hardening
    /// will wire real CSPR purse transfer once Casper account abstraction ships).
    pub fn register_external_verifier(
        &mut self,
        agent_id: String,
        bond_amount: U512,
        x402_price: U512,
    ) {
        let min = self.min_external_bond.get_or_default();
        if bond_amount < min {
            self.env().revert(Error::AgentNotBonded);
        }
        if self.agents.get(&agent_id).is_some() {
            self.env().revert(Error::AgentAlreadyRegistered);
        }
        let caller = self.env().caller();
        let record = AgentRecord {
            agent_id: agent_id.clone(),
            owner: caller,
            role: AgentRole::ExternalVerifier,
            bonded_amount: bond_amount,
            reputation: 100,
            total_reports: 0,
            successful_reports: 0,
            slashed_count: 0,
            active: true,
            x402_price,
        };
        self.agents.set(&agent_id, record);
        self.env().emit_event(AgentRegistered {
            agent_id: agent_id.clone(),
            role: AgentRole::ExternalVerifier,
        });
        self.env().emit_event(BondPosted { agent_id, amount: bond_amount });
    }

    pub fn post_bond(&mut self, agent_id: String, amount: U512) {
        let agent = self.require_agent(&agent_id);
        self.require_owner_or_admin(&agent);
        let mut a = agent;
        a.bonded_amount += amount;
        a.active = true;
        self.agents.set(&agent_id, a);
        self.env().emit_event(BondPosted { agent_id, amount });
    }

    pub fn release_bond(&mut self, agent_id: String) {
        let agent = self.require_agent(&agent_id);
        self.require_owner_or_admin(&agent);
        let mut a = agent;
        a.bonded_amount = U512::zero();
        a.active = false;
        self.agents.set(&agent_id, a);
    }

    /// Phase 2: agents can update their x402 price dynamically.
    pub fn update_x402_price(&mut self, agent_id: String, new_price: U512) {
        let agent = self.require_agent(&agent_id);
        self.require_owner_or_admin(&agent);
        let mut a = agent;
        a.x402_price = new_price;
        self.agents.set(&agent_id, a);
        self.env().emit_event(X402PriceUpdated { agent_id, new_price });
    }

    /// Slash — called by ChallengeCourt resolution. Slashes internal bond.
    pub fn slash_agent(&mut self, agent_id: String, recipient_id: String) {
        self.require_admin();
        let mut bad = self.require_agent(&agent_id);
        let slashed = bad.bonded_amount;
        bad.bonded_amount = U512::zero();
        bad.slashed_count += 1;
        bad.active = false;
        bad.reputation = bad.reputation.saturating_sub(50);
        self.agents.set(&agent_id, bad);

        // Reward recipient (challenger).
        if let Some(mut good) = self.agents.get(&recipient_id) {
            good.bonded_amount += slashed;
            good.reputation += 10;
            good.successful_reports += 1;
            good.total_reports += 1;
            self.agents.set(&recipient_id, good);
        }

        self.env().emit_event(AgentSlashed {
            agent_id,
            amount: slashed,
            recipient: recipient_id,
        });
    }

    pub fn increment_report(&mut self, agent_id: String, success: bool) {
        self.require_admin();
        if let Some(mut a) = self.agents.get(&agent_id) {
            a.total_reports += 1;
            if success { a.successful_reports += 1; }
            self.agents.set(&agent_id, a);
        }
    }

    pub fn update_reputation(&mut self, agent_id: String, delta: i32) {
        self.require_admin();
        if let Some(mut a) = self.agents.get(&agent_id) {
            if delta >= 0 {
                a.reputation += delta as u32;
            } else {
                a.reputation = a.reputation.saturating_sub((-delta) as u32);
            }
            self.agents.set(&agent_id, a);
        }
    }

    // ---- Getters ----

    pub fn get_agent(&self, agent_id: String) -> AgentRecord {
        self.require_agent(&agent_id)
    }

    pub fn is_bonded(&self, agent_id: String) -> bool {
        match self.agents.get(&agent_id) {
            Some(a) => a.active && !a.bonded_amount.is_zero(),
            None => false,
        }
    }

    /// Phase 2: reputation-weighted challenger bond floor.
    /// Higher-reputation challengers pay a lower counter-bond (as a %).
    pub fn challenger_bond_floor(&self, challenger_id: String, base: U512) -> U512 {
        match self.agents.get(&challenger_id) {
            Some(a) => {
                // floor = base * (200 - reputation) / 200  (capped to 50%–100% of base)
                let rep = a.reputation.min(200) as u64;
                let factor = (200u64.saturating_sub(rep)).max(100);
                base * U512::from(factor) / U512::from(200u64)
            }
            None => base,
        }
    }

    fn require_agent(&self, agent_id: &str) -> AgentRecord {
        match self.agents.get(&agent_id.to_string()) {
            Some(a) => a,
            None => self.env().revert(Error::AgentNotFound),
        }
    }

    fn internal_register(&mut self, agent_id: String, role: AgentRole, price: U512) {
        if self.agents.get(&agent_id).is_some() {
            self.env().revert(Error::AgentAlreadyRegistered);
        }
        let caller = self.env().caller();
        let record = AgentRecord {
            agent_id: agent_id.clone(),
            owner: caller,
            role: role.clone(),
            bonded_amount: U512::zero(),
            reputation: 100,
            total_reports: 0,
            successful_reports: 0,
            slashed_count: 0,
            active: true,
            x402_price: price,
        };
        self.agents.set(&agent_id, record);
        self.env().emit_event(AgentRegistered { agent_id, role });
    }
}
