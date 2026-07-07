//! Verifier/challenger agent registration and bond accounting.
//!
//! MVP note (Section 6.4 rule / Section 20): bonds are tracked as an internal
//! U512 ledger inside the contract rather than real purse locking. This keeps
//! the Qualification loop deterministic; upgrading to real purse/transfer logic
//! is a Phase 2 change and does not affect the accounting semantics here.

use crate::types::*;
use odra::prelude::*;
use crate::WardensCore;
use odra::casper_types::U512;

impl WardensCore {
    pub(crate) fn internal_register_agent(&mut self, agent_id: String, role: AgentRole) {
        if self.agents.get(&agent_id).is_some() {
            self.env().revert(Error::AgentAlreadyRegistered);
        }
        let agent = Agent {
            agent_id: agent_id.clone(),
            owner: self.env().caller(),
            role: role.clone(),
            bonded_amount: U512::zero(),
            reputation: 100, // everyone starts at a neutral 100
            total_reports: 0,
            successful_reports: 0,
            slashed_count: 0,
            active: true,
        };
        self.agents.set(&agent_id, agent);
        self.env().emit_event(AgentRegistered { agent_id, role });
    }

    pub(crate) fn internal_post_bond(&mut self, agent_id: String, amount: U512) {
        let mut agent = self.require_agent(&agent_id);
        agent.bonded_amount += amount;
        agent.active = true;
        self.agents.set(&agent_id, agent);
        self.env().emit_event(BondPosted { agent_id, amount });
    }

    pub(crate) fn internal_release_bond(&mut self, agent_id: String) {
        let mut agent = self.require_agent(&agent_id);
        // Internal ledger: releasing simply zeroes the bond and marks inactive.
        agent.bonded_amount = U512::zero();
        agent.active = false;
        self.agents.set(&agent_id, agent);
    }

    pub(crate) fn require_agent(&self, agent_id: &str) -> Agent {
        match self.agents.get(&agent_id.to_string()) {
            Some(a) => a,
            None => self.env().revert(Error::AgentNotFound),
        }
    }

    pub(crate) fn require_bonded(&self, agent_id: &str) -> Agent {
        let agent = self.require_agent(agent_id);
        if !agent.active || agent.bonded_amount.is_zero() {
            self.env().revert(Error::AgentNotBonded);
        }
        agent
    }
}
