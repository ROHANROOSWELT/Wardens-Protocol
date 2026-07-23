# 🛡️ Wardens Protocol — The 100% On-Chain Decentralized Trust Market

<p align="center">
  <img src="https://img.shields.io/badge/Rust-black?style=for-the-badge&logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/Odra-orange?style=for-the-badge" alt="Odra">
  <img src="https://img.shields.io/badge/Casper%20Network-red?style=for-the-badge" alt="Casper Network">
  <img src="https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/Microsoft%20Azure-blue?style=for-the-badge&logo=microsoftazure" alt="Azure">
  <img src="https://img.shields.io/badge/Status-100%25_On--Chain-brightgreen?style=for-the-badge" alt="100% On Chain">
</p>

<p align="center">
  <b>⚡ Trust should be continuously earned—not permanently assumed.</b>
</p>

<p align="center">
  <a href="https://wardens-protocol.vercel.app">🌍 Live Demo</a> •
  <a href="https://github.com/ROHANROOSWELT/Wardens-Protocol/blob/main/PROOF.md">📜 Testnet Proof</a> •
  <a href="https://www.youtube.com/watch?v=XzGEAL43tB4">🎥 Demo Video</a>
</p>

---

## 🏆 The Vision: Solving the "Stale Collateral" Crisis
In traditional Decentralized Finance (DeFi) and Real-World Asset (RWA) lending, collateral is checked once during onboarding and then largely ignored. If an invoice defaults, a shipping container sinks, or a physical asset degrades, the on-chain smart contract has no idea. **The collateral becomes stale, creating massive systemic risk.**

**Wardens Protocol** is a 100% on-chain decentralized oracle network built natively on the Casper Network to solve this. It replaces static collateral with a continuous, hyper-vigilant market of autonomous AI and deterministic verifier agents that constantly monitor, score, and challenge RWA collateral in real-time.

---

## 📊 At a Glance (The Tech Stack)

| Feature | Description |
| :--- | :--- |
| **100% ON-CHAIN** | Absolutely zero mocked endpoints. Every RWA score, agent bond, and arbitration vote is a real cryptographic deploy executed via our Rust Livenet Executor on the Casper Testnet. |
| **8 Smart Contracts** | Highly modular "Covenant Engine" architecture built strictly in Rust using the Odra Framework. |
| **5 Autonomous Agents** | Specialized microservices executing parallel verification logic (Parser, Fraud, Registry, Aggregator, Challenger). |
| **x402 Micropayments** | Cutting-edge HTTP 402 API monetization. Agents demand cryptographic micropayment proofs before executing validation. |
| **Production Architecture** | A robust hybrid deployment: Next.js edge-rendered UI on Vercel, securely proxying to a dedicated Microsoft Azure VM running our Node.js Orchestrator and PM2 Agent Daemon. |

---

## 🚀 How It Works (The 100% On-Chain Flow)

1. **Verify (x402 Handshake):** An RWA issuer uploads an invoice. The Backend Orchestrator initiates an unauthenticated request to the verifier agents. The agents reply with an `HTTP 402 Payment Required`. The Orchestrator pays the micropayment, receives an `x402_receipt`, and the agents parse the RWA metadata.
2. **Score (Casper Smart Contracts):** Agents execute strict deterministic heuristics to validate the asset. The final Trust Score (0-100) is submitted directly to the `ScoreRegistry` smart contract on the Casper Testnet. 
3. **Challenge (Arbitration Court):** A background "Challenger Agent" continuously pulls state from the Casper blockchain. If it catches a verifier hallucinating or lying, it pays a "Counter Bond" and opens an on-chain dispute in the `ChallengeCourt` contract. 
4. **Slash & Freeze (Covenant Engine):** Other registered agents cast their votes on-chain. If the verifier is proven wrong, its bonded CSPR is permanently slashed, and the `CovenantEngine` instantly drops the asset's Loan-to-Value (LTV) to 0%, freezing the vault.

---

## 🏛️ Smart Contract Architecture (Phase 1 & Phase 2)

We built an incredibly ambitious, dual-phase contract suite using the **Odra Framework** for Casper.

### Phase 1: `WardensCore`
The original monolithic contract that handles end-to-end asset registration, basic agent bonding, score submission, and rudimentary LTV freezing.

### Phase 2: Protocol V2 (The Covenant Engine Suite)
To prove enterprise scalability, we shattered the monolith into **8 distinct modular contracts**:
1. **AssetRegistry:** Tokenizes RWA metadata and baseline status.
2. **ScoreRegistry:** Stores the immutable ledger of agent-submitted trust scores.
3. **BondVault:** Escrows the Casper token (CSPR) stakes deposited by verifier agents.
4. **ChallengeCourt:** Handles multi-agent voting arbitration and on-chain dispute resolutions.
5. **LendingVault:** A DeFi lending pool that algorithmically enforces LTV limits based on Trust Scores.
6. **CovenantEngine:** A programmatic rule-engine assigning strict compliance states (Full Access, Monitored, Draws Frozen, Breach Mode).
7. **ReserveVault:** Manages locked capital tranches released only when Covenant Engine state allows.
8. **PrivacyStore:** A Merklized data registry for zero-knowledge evidence hashes, keeping sensitive RWA data off-chain while maintaining verifiability.

---

## 🤖 The Autonomous Agent Network

The protocol relies on a microservice architecture of independent Node.js/Bun agents. To optimize gas and on-chain state, we employ a **Hybrid Registry Strategy**: all 5 agents run continuously in the background via PM2 on Azure, but only the critical public actors (Aggregator and Challenger) lock up public cryptographic bonds on the Casper blockchain.

1. **Parser Agent (`:4101`)**: Downloads the raw JSON invoice, parsing data to ensure claimed `amount` and `due_date` perfectly match the cryptographic metadata.
2. **Fraud Agent (`:4102`)**: Scans live blockchain state for duplicate invoice hashes or suspiciously identical face values across different issuers.
3. **Registry Agent (`:4103`)**: Performs algorithmic heuristic checks on issuer and debtor credentials.
4. **Aggregator Agent (On-Chain Verifier)**: Collects scores from the internal agents, drops extreme outliers, and submits the finalized Trust Score to Casper.
5. **Challenger Agent (On-Chain Auditor)**: An autonomous one-shot cron job that audits scores. If it detects fraud, it interacts with the `ChallengeCourt` contract to slash the aggregator.

---

## 🔗 Live Testnet Deployed Contracts

The complete protocol suite is successfully deployed and running on the live Casper Testnet.

### Core Contract (Phase 1)
| Contract | Casper Testnet Hash |
| :--- | :--- |
| **WardensCore** | `contract-package-ef137b674026c1c08e55fc16e7d9e0dac9eec6b1a96b9f0b54b8fc729a9874de` |

### Covenant Engine / Protocol V2 (Phase 2 Modular Architecture)
| Module | Casper Testnet Hash |
| :--- | :--- |
| **AssetRegistry** | `contract-package-8c6e8f1c799d4abc596973d612492e5b5b03643247d0af27a0db363f7e360320` |
| **ScoreRegistry** | `contract-package-3afb414e8f2f2e2c1db569945dc34fa6705bb5efa3c945c7d37856bff7682590` |
| **BondVault** | `contract-package-249f599014a2167dab598362451b4c7b591884b7a9e5f3e65f4f31a5e4783f38` |
| **ChallengeCourt**| `contract-package-83afda159a1e580ccf4baf2144a06a9f753df0db46b5b019e1fe061098f43f27` |
| **LendingVault** | `contract-package-9b83b046e8749359f1cf096420ff5b029cec12777173ab891aa64d00a736bb09` |
| **CovenantEngine**| `contract-package-8b3f4001f64a30028bccb919cf9f235bc2b3ff2fc642683d6c799b5d2fbab50e` |
| **ReserveVault** | `contract-package-c64d65803aa4975709d88f8a039d0b082cb7fed8d000b551a09806424ab08c2f` |
| **PrivacyStore** | `contract-package-ac2adf6c0770d2ca1ac44bf197469ee23735587c28507f4eb6ce98743ebb9497` |

---

## 🏆 Why This Entry Wins (Buildathon Specs)
**Wardens Protocol is not a mockup.** It is a massive, meticulously engineered ecosystem.
* **Flawless Execution**: From the Vercel edge to the Azure VM, straight down to the Rust Livenet Executor, everything functions in production.
* **Strict Determinism**: We do not rely on AI hallucinations for slashing. All agent validation is 100% deterministic and mathematically provable on-chain.
* **Complete Vision**: We didn't just build a smart contract; we built a frontend dashboard, a backend orchestrator, a fleet of AI agents, and a monetization layer (x402). 

Wardens Protocol brings absolute trust, programmatic enforcement, and automated liquidation to the $10 Trillion Real-World Asset market.
