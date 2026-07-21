# 🛡️ Wardens Protocol

<p align="center">
  <img src="docs/wardens_logo.png" width="250" alt="Wardens Protocol Logo">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Rust-black?style=for-the-badge&logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/Odra-orange?style=for-the-badge" alt="Odra">
  <img src="https://img.shields.io/badge/Casper%20Network-red?style=for-the-badge" alt="Casper Network">
  <img src="https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/Build-Passing-green?style=for-the-badge" alt="Build Passing">
  <img src="https://img.shields.io/badge/Status-100%25_On--Chain-brightgreen?style=for-the-badge" alt="100% On Chain">
</p>

<p align="center">
  <b>⚡ Live Casper Testnet • 🤖 6 Autonomous Agents • 💸 x402 Micropayments • 🛡️ On-chain Slashing • 🏦 Covenant Engine</b>
</p>

<p align="center">
  <a href="https://github.com/ROHANROOSWELT/Wardens-Protocol/blob/main/PROOF.md">📜 Testnet Proof</a> •
  <a href="PLAYBOOK.md">📖 DoraHacks Playbook</a> •
  <a href="https://www.youtube.com/watch?v=XzGEAL43tB4">🎥 Demo Video</a> •
  <a href="https://testnet.cspr.live/transaction/89ee2b761ad1a82fbaa70558e4eb6e03dba5ae3e51aba5acade8456380a41082">🔗 Deploy Tx</a>
</p>

***

## 🏆 Why This Entry Wins (Buildathon Specs)
**Wardens Protocol is not a mockup.** It is a production-grade, 100% on-chain system built natively on the Casper Network to solve the Real-World Asset (RWA) "stale collateral" problem. 

* **ZERO Mock Data**: The system is hardwired directly to the live Casper Testnet. The Next.js dashboard and backend orchestrator sync seamlessly with the blockchain state in real-time. No local JSON stubs are used.
* **Deterministic Agent Intelligence**: The autonomous verifier agents execute strict, deterministic, mathematical cross-validation on actual uploaded JSON invoice documents and on-chain ledgers. 
* **x402 Micropayments**: We integrated a native machine-to-machine payment handshake where agents demand Casper tokens via HTTP 402 headers before executing validation logic.
* **Modular "Covenant Engine" Architecture**: Smart contracts have been deeply modularized into a Covenant Engine, Reserve Vault, and Multi-Agent Arbitration court for maximum enterprise scalability.

---

## 📖 Comprehensive Introduction

Wardens Protocol implements a self-policing, adversarial multi-agent trust market to secure Real-World Asset (RWA) collateral on the Casper Network. 

In traditional DeFi, tokenized RWA assets (like invoices or real estate) suffer from a **"stale collateral"** problem: they are audited once at tokenization, but their trust is assumed indefinitely even if their off-chain status deteriorates. Wardens Protocol demonstrates how a decentralized network of Verifier Agents can continuously audit collateral off-chain, paid per-request via native **x402 Micropayments**. 

If a background Challenger Agent proves a verification is fraudulent, the verifier's bond is slashed on-chain, and the Lending Vault immediately updates its Loan-to-Value (LTV) limits to 0% to protect pool depositors. Instead of assuming trust, the protocol continuously forces agents to *earn* it.

---

## 🤖 The Autonomous Agent Network (Deep Dive)

The protocol relies on a microservice architecture of independent agents, each specializing in a specific vector of RWA validation.

1. **Parser Agent (`:4101`)**: 
   * **Role:** Structural analysis. 
   * **Logic:** Downloads the raw, off-chain JSON invoice document, parses the data, and ensures the claimed `amount` and `due_date` inside the document perfectly match the cryptographic metadata committed to the Casper blockchain.
2. **Fraud Agent (`:4102`)**: 
   * **Role:** Anomaly detection. 
   * **Logic:** Scans the live Casper blockchain state for duplicate invoice hashes or suspiciously identical face values across different issuers, penalizing assets that appear to be double-financed.
3. **Registry Agent (`:4103`)**: 
   * **Role:** Counterparty verification. 
   * **Logic:** Performs algorithmic heuristic checks on the issuer and debtor strings (e.g., checking for restricted corporate entities, length anomalies, and formatting).
4. **Aggregator Agent**: 
   * **Role:** Consensus engine.
   * **Logic:** Collects the individual scores from the Parser, Fraud, and Registry agents, calculates the weighted median score, drops extreme outliers, and submits the finalized Trust Score to the Casper smart contract.
5. **Challenger Agent (The Auditor)**: 
   * **Role:** Adversarial policing.
   * **Logic:** Runs an autonomous background loop pulling live state from Casper. If it detects a Trust Score that is suspiciously high for a flagged asset, it pays a "Counter Bond" to the smart contract and opens an official dispute in the Challenge Court to slash the verifier.
6. **Insurance Agent (`:4104`)**: 
   * **Role:** Risk Underwriting (Phase 2).
   * **Logic:** Evaluates the on-chain LTV and Covenant State to calculate an automated insurance premium baseline for the asset pool.

---

## 🧠 Determinism vs. LLM Integration

A critical vulnerability in agentic financial systems is the non-determinism of Large Language Models (LLMs) executing state changes. Wardens Protocol solves this by strictly isolating LLMs:

* **Strict Determinism for Slashing:** All Trust Scores (0-100) and Valid/Invalid booleans are calculated using strict, mathematical heuristics in TypeScript. This ensures that if a verifier is slashed on-chain, it is based on mathematically provable facts, preventing AI hallucinations from stealing agent bonds.
* **LLMs for Explainability:** The system queries an LLM (Gemini 2.0 / OpenAI) strictly in a "read-only" post-processing step. The LLM translates the deterministic findings array (e.g., `["Mismatch: document amount 5000 != chain amount 8000"]`) into a human-readable legal summary for the dashboard, but its output is never used to calculate the score.

---

## 🏛️ Smart Contract Architecture (Phase 1 & Phase 2)

The system is built on Casper using the Odra framework, divided into a Phase 1 MVP and a massively expanded Phase 2 modular architecture.

### Phase 1: `WardensCore`
The original monolithic contract that handles asset registration, basic agent bonding, score submission, and rudimentary LTV freezing.

### Phase 2: Protocol V2 (The Covenant Engine Suite)
To prove enterprise readiness, we shattered the monolith into 8 distinct modular contracts:
1. **AssetRegistry:** Stores the baseline metadata and status of the tokenized collateral.
2. **ScoreRegistry:** Stores the immutable ledger of agent-submitted trust scores.
3. **BondVault:** Escrows the Casper token (CSPR) stakes deposited by verifier agents.
4. **ChallengeCourt:** Handles multi-agent voting arbitration and on-chain dispute resolutions.
5. **LendingVault:** A DeFi lending pool that checks LTV limits before authorizing CSPR withdrawals.
6. **CovenantEngine:** A programmatic rule-engine that assigns compliance states (`FullAccess`, `Monitored`, `DrawsFrozen`) based on score thresholds.
7. **ReserveVault:** Manages locked capital tranches, allowing release *only* if the CovenantEngine permits it.
8. **PrivacyStore:** A Merklized data registry for committing zero-knowledge evidence hashes without revealing the underlying PII data.

---

## 💸 The x402 Micropayment Protocol (Technical Details)

To monetize the agent network, we built a native adaptation of the L402 API payment standard.

1. **The Demand:** When the Orchestrator sends an unauthenticated `POST /verify` to an agent, the agent immediately rejects it with an `HTTP 402 Payment Required` status code, injecting `X-Payment-Amount` and `X-Payment-Address` headers.
2. **The Handshake:** The Orchestrator detects the 402, processes the micropayment, and retries the request with a cryptographic `X-Payment` proof header.
3. **The Receipt:** The agent verifies the payment, executes the verification logic, and returns a secure `x402_receipt` hash bound to the payload.

---

## ⚖️ On-Chain Slashing & LTV Mathematics

The dynamic nature of the protocol is enforced entirely by the Casper smart contracts:

**LTV (Loan-to-Value) Scaling Machine:**
* **Score 80 - 100:** Asset is healthy -> `75% LTV`
* **Score 50 - 79:** Asset is risky -> `50% LTV`
* **Score 0 - 49:** Asset is fraudulent -> `0% LTV` (Frozen, all borrows blocked immediately)

**Slashing Economics:**
* **Challenger Wins:** The dishonest verifier's entire bond is burned/redistributed. The verifier's reputation drops by 50, and their account is deactivated. The challenger receives the verifier's slashed bond + their own counter-bond back.
* **Verifier Wins:** The challenger loses their counter-bond for raising a frivolous dispute.

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

## ⚙️ Quick Start & Local Run

> 📖 **Full step-by-step replication guide: [SETUP.md](SETUP.md).**

### Prerequisites
*   [Bun](https://bun.sh) runtime installed
*   Rust and [cargo-odra](https://odra.dev)

### Step 1: Launch the Backend & Agents
Start the verifier agents and the backend orchestrator:
```bash
bash scripts/start_all.sh
```
*   *Note: Because `WARDENS_MODE=chain`, this immediately connects to the Casper Testnet and waits for real operations!*

### Step 2: Run the Dashboard UI
```bash
cd dashboard
bun install
bun run dev
```
Open `http://localhost:3000` to interact with the live neobrutalist dashboard.

---

## 📂 Repository Layout

```
contracts/wardens_core/   Phase 1: Core Wardens Odra contract + passing tests
contracts/wardens_phase2/ Covenant Engine: Modularized contracts (Registry, CovenantEngine, etc.)
backend/                  Express orchestrator connecting to live Casper Testnet
agents/                   parser · fraud · registry (x402) · aggregator · challenger · insurance
dashboard/                One-page Next.js interface for Control Room and Covenant Engine
scripts/                  Livenet scripts (start_all · seed_demo · run_verification · deploy)
PROOF.md                  Deploy + transaction hashes + full testnet verification proof
```

---

## 👁️ Vision

> **Wardens Protocol turns trust from a one-time assumption into a continuously verified economic market.** Autonomous agents compete to earn trust, challengers protect the network from fraud, and Casper enforces accountability through transparent, on-chain incentives. Every loan reflects the current state of reality—not yesterday's audit.

---

## 📄 License
MIT — see `LICENSE` for details.
