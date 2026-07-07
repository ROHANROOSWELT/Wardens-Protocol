# Wardens Protocol — Technical Sequence Diagrams

This document contains the detailed step-by-step sequence diagrams illustrating the core interaction flows in the Wardens Protocol network.

## 1. Verification & x402 Micropayment Handshake

The verification flow leverages the Casper AI Toolkit's HTTP-native micropayment design to enable automated machine-to-machine settlements:

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Dashboard
    participant Backend as Backend Orchestrator
    participant Verifier as Verifier Agent (Parser/Fraud/Registry)
    participant Casper as Casper Testnet (WardensCore)

    User->>Backend: Trigger Verification (POST /api/verify)
    
    note over Backend, Verifier: Step A: x402 Payment Quote Handshake
    Backend->>Verifier: Request Verification Audit (GET /verify)
    Verifier-->>Backend: HTTP 402 Payment Required (Price, Address, Network)
    
    note over Backend, Casper: Step B: Pay-Per-Request Settlement
    Backend->>Casper: Transfer CSPR/tokens to Verifier Wallet
    Casper-->>Backend: Return Transaction/Deploy Hash
    
    note over Backend, Verifier: Step C: Verified Verification Response
    Backend->>Verifier: Retry with X-Payment Header (Tx Hash)
    Verifier->>Casper: Verify payment status on-chain
    Verifier-->>Backend: Return Audit Score + Cryptographic x402_receipt Hash
    
    note over Backend, Casper: Step D: On-Chain Score & LTV Update
    Backend->>Casper: submit_score(asset_id, score, signatures)
    Casper->>Casper: Recalculate Vault LTV dynamically
    Casper-->>User: Score updated, LTV adjusted, Borrowing Enabled
```

---

## 2. Challenger & Slashing Flow

The Challenger Agent runs continuously as a background auditing service, enforcing compliance on-chain through game-theoretic incentives:

```mermaid
sequenceDiagram
    autonumber
    participant Casper as Casper Testnet (WardensCore)
    participant Challenger as Challenger Agent
    participant Backend as Backend Ledger (Source of Truth)
    participant Court as ChallengeCourt / Resolver

    loop Continuous Monitoring
        Challenger->>Casper: Poll latest posted scores
    end

    note over Challenger, Backend: Step A: Discrepancy Detection
    Challenger->>Backend: Query raw invoice ledger status
    Backend-->>Challenger: Returns real invoice state (e.g. Paid)
    Challenger->>Challenger: Detect discrepancy (Verifier posted high score for paid invoice)

    note over Challenger, Casper: Step B: Open Dispute & Stake Bond
    Challenger->>Casper: open_challenge(score_id, reason) + stake counter-bond
    Casper->>Casper: Lock Challenger stake & transition asset state to CHALLENGED

    note over Court, Casper: Step C: Arbitration & Slashing
    Court->>Casper: resolve_challenge(challenge_id, upheld=true)
    Casper->>Casper: Slash Verifier bond -> credit to Challenger
    Casper->>Casper: Freeze Asset Collateral (LTV set to 0%)
    Casper-->>Challenger: Reward credited, asset frozen
```
