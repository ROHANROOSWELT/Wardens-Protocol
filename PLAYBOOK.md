# DoraHacks Playbook — Wardens Protocol

Wardens Protocol implements a self-policing, adversarial multi-agent trust market to secure Real-World Asset (RWA) collateral on the Casper Network. This playbook provides step-by-step testing instructions to run the protocol locally and verify its deployment on the Casper Testnet.

---

## 🚀 Part 1: Quick Start & Local Run

Follow these steps to spin up the local Wardens ecosystem and run the verification game loop.

### 📋 Prerequisites
- [Bun](https://bun.sh) (version 1.1 or later)
- Rust (Nightly toolchain for compiling contracts)
- [cargo-odra](https://odra.dev)

### Step 1: Clone and Install
Clone the repository and install dependencies:
```bash
git clone https://github.com/ROHANROOSWELT/Wardens-Protocol.git
cd Wardens-Protocol
```

### Step 2: Run the Smart Contract Test Suite
Verify that all 12 smart contract unit tests compile and pass:
```bash
cd contracts/wardens_core
cargo test
```
All tests should pass:
```
test result: ok. 12 passed; 0 failed; 0 ignored
```

### Step 3: Launch the Agent Ecosystem
Open a new terminal window at the root of the repository and launch the Express orchestrator and autonomous agent daemons:
```bash
cd ../..
bash scripts/start_all.sh
```
*   **Orchestrator Backend:** Runs on `http://localhost:4000`
*   **Verifier Agents (Parser, Fraud, Registry):** Run on ports `4101-4103`

### Step 4: Run the On-Chain Simulation Scripts
Execute the simulation scripts to drive the entire end-to-end lifecycle:

1. **Seed Assets & Register Agents:**
   ```bash
   bash scripts/seed_demo.sh
   ```
2. **Run Verifications:**
   Processes invoice `INV-001` (healthy) and `INV-002` (duplicate/fraud):
   ```bash
   bash scripts/run_verification.sh
   ```
3. **Run Challenges and Slashes:**
   Processes `INV-003` (dishonest score challenged and slashed):
   ```bash
   bash scripts/run_challenge.sh
   ```

### Step 5: Launch the Interactive Dashboard
Launch the Next.js frontend to monitor the state in real-time:
```bash
cd dashboard
bun install
bun run dev
```
Open `http://localhost:3000` to interact with the console.

---

## 🌐 Part 2: Casper Testnet Deployment Proofs

Wardens Protocol is fully functional and active on the **Casper Testnet** (`casper-test`, Casper 2.0). Every hash below is a live transaction which can be verified on the Casper Explorer.

### Key Hashes
- **Contract Package Hash:** `ef137b674026c1c08e55fc16e7d9e0dac9eec6b1a96b9f0b54b8fc729a9874de`
- **Casper Explorer Link:** [View Contract Package on CSPR.live](https://testnet.cspr.live/contract-package/ef137b674026c1c08e55fc16e7d9e0dac9eec6b1a96b9f0b54b8fc729a9874de)
- **Admin (Deployer) Account:** `b569d04d8d3e99c7fc44679d0ae3d7a430a7b13282c04cdc4c1db885d6e38fd9`

### Live Transaction Log

| Operation | Casper Testnet Transaction Hash | Result & Description |
| :--- | :--- | :--- |
| **Deploy WardensCore** | `89ee2b761ad1a82fbaa70558e4eb6e03dba5ae3e51aba5acade8456380a41082` | Installs the core smart contract on Casper Testnet |
| **Create Asset INV-001** | `92a7e961f6c6574c49101fda09c44a806f112b66f76fe207660f2505a716d463` | Registers first invoice asset collateral on-chain |
| **Create Asset INV-002** | `6054a078377a92f5fae4162319742d9b96c4ec71db7085fbdd1e9151852c6360` | Registers second invoice asset collateral on-chain |
| **Create Asset INV-003** | `b345ad3cbc0fe7a4bc93e11f356c8f083e2fd597e27f15f705655fce21e89f44` | Registers third invoice asset collateral on-chain |
| **Register Verifier** | `3d738485db86736c4b2c31f2109ef4782b7a034a218cb9ea740328574dac3ea3` | Registers the aggregator verifier agent |
| **Register Challenger** | `0dea2958d32ccc24143dbb67db40f3daf656b721724c07d20fa94408250181b3` | Registers the background challenger agent |
| **Post Verifier Bond** | `76ea896f7881db97c527e71c6b33bb0b5bfd8d53b0bc7d8e88a4e5eb3e96ba8c` | Aggregator locks 10 CSPR stake as honesty bond |
| **Post Challenger Bond**| `f4fa5a9f64c4dfb55e5a969a21efc000ec0500f6e2799017a1f8ae18befcac5c` | Challenger locks 10 CSPR stake to initiate challenges |
| **Submit Score (94)** | `c5b269f22bf8e8f8c0467aa84daeb6bfbc9ed8ff2ad8ef2e99dff38c912a7038` | Honest verifier posts healthy score of 94 for INV-001 |
| **Deposit Collateral** | `fe9d5dfcc2a288a46091a340ed9a3990a3f235ebae104dc90708a890a0ad0ce2` | Locks collateral value for INV-001 |
| **Borrow CSPR (700)** | `ce7d6499f531eb08671f1d76641a1768d64dcb5c1aa68d34273a5af2a1f02308` | Loan authorized up to 75% LTV limit |
| **Submit Score (46)** | `503620b136d3d6b234f634573fe1302f28a93b0f7c0d0f5aaa895ec0a426334c` | Verifier posts 46 score for INV-002; LTV drops to 0% (Frozen) |
| **Submit Score (90)** | `ad0942bafa9443966977d73189718aa22f78b766a6abd7e4dcef58af8c613821` | Dishonest verifier posts false score of 90 for INV-003 |
| **Open Challenge** | `dfc4085365b27ac843342afa6dba9c48718a709f95e233941838e05e0ab57014` | Challenger disputes the INV-003 score on-chain |
| **Resolve Challenge** | `f9231526dba6869087b08cf5f53fc87d9d1f93bb1d5cbbaef9f48c7b42da8687` | Upheld: verifier slashed, challenger rewarded, INV-003 frozen |

---

## 🛠️ GitHub Compliance Meta-Tags
For the repository settings, please verify that you have added the following topics/tags via the GitHub UI:
- `casper-blockchain`
- `casper-network`
- `buildathon`
- `defi`
- `rwa`
- `multi-agent-system`
