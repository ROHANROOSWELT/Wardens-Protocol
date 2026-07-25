// casperClient — the backend's ONLY gateway to WardensCore on Casper Testnet.
//
// This file does NOT have a simulation mode. Every operation submits a real
// deploy to the Casper Testnet via the livenet CLI binary.
//
// Required environment variables (set in ecosystem.config.js or .env):
//   WARDENS_MODE=chain
//   WARDENS_CORE_ADDRESS=contract-package-<hash>
//   ODRA_CASPER_LIVENET_NODE_ADDRESS=https://node.testnet.casper.network/rpc
//   ODRA_CASPER_LIVENET_CHAIN_NAME=casper-test
//   ODRA_CASPER_LIVENET_SECRET_KEY_PATH=/path/to/secret_key.pem
//   ODRA_CASPER_LIVENET_EVENTS_URL=http://<node>:9999/events/main
//
// If WARDENS_MODE is not "chain", ALL operations throw — there is no fallback.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { ltvForScore, statusForScore, type AssetStatus } from "./scoreEngine.ts";

const STALENESS_WINDOW_SECONDS = 600;

export interface TxRecord {
  action: string;
  deploy_hash: string;
  result: string;
  timestamp: number;
}

export interface Asset {
  asset_id: string;
  issuer: string;
  debtor: string;
  face_value: number;
  due_date: number;
  evidence_hash: string;
  status: AssetStatus;
  current_score: number;
  created_at: number;
  updated_at: number;
}

export interface Agent {
  agent_id: string;
  role: string;
  bonded_amount: number;
  reputation: number;
  total_reports: number;
  successful_reports: number;
  slashed_count: number;
  active: boolean;
  /** x402 payment price in motes. Sourced from BondVault.get_agent().x402_price in chain mode. */
  x402_price: number;
}

export interface TrustScore {
  score_id: number;
  asset_id: string;
  score: number;
  agent_id: string;
  evidence_hash: string;
  explanation_hash: string;
  timestamp: number;
  challenge_deadline: number;
  challenged: boolean;
}

export interface Challenge {
  challenge_id: number;
  asset_id: string;
  score_id: number;
  challenger_agent_id: string;
  challenged_agent_id: string;
  counter_evidence_hash: string;
  counter_bond: number;
  status: "Open" | "Upheld" | "Rejected";
  opened_at: number;
  resolved_at: number;
}

export interface VaultPosition {
  asset_id: string;
  collateral_value: number;
  borrowed_amount: number;
  current_ltv: number;
  frozen: boolean;
}

const ROOT = fileURLToPath(new URL("../../..", import.meta.url)); // repo root
const CONTRACT_DIR = `${ROOT}/contracts/wardens_core`;
const RELEASE_BIN = `${CONTRACT_DIR}/target/release/wardens_livenet`;
const DEBUG_BIN = `${CONTRACT_DIR}/target/debug/wardens_livenet`;
const BIN = existsSync(RELEASE_BIN) ? RELEASE_BIN : DEBUG_BIN;

function assertChainMode() {
  const mode = process.env.WARDENS_MODE;
  if (mode !== "chain") {
    throw new Error(
      `WARDENS_MODE is "${mode ?? "unset"}" — must be "chain". ` +
      `Set WARDENS_MODE=chain in your environment or ecosystem.config.js.`
    );
  }
}

function formatAddress(addr: string): string {
  if (addr.startsWith("hash-")) {
    return addr.replace("hash-", "contract-package-");
  }
  return addr;
}

function resolveSecretKeyPath(): string {
  const candidates = [
    process.env.ODRA_CASPER_LIVENET_SECRET_KEY_PATH,
    process.env.BACKEND_PRIVATE_KEY_PATH,
    "/home/azureuser/Desktop/keys/secret_key.pem",
    "/home/rohan/Desktop/keys/secret_key.pem",
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return "/home/azureuser/Desktop/keys/secret_key.pem";
}

function getLivenetEnv() {
  const addr = process.env.WARDENS_CORE_ADDRESS || process.env.WARDENS_CORE_HASH || "";
  const formattedAddr = formatAddress(addr);
  return {
    ...process.env,
    WARDENS_CORE_ADDRESS: formattedAddr,
    ODRA_CASPER_LIVENET_NODE_ADDRESS: process.env.ODRA_CASPER_LIVENET_NODE_ADDRESS || "https://node.testnet.casper.network/rpc",
    ODRA_CASPER_LIVENET_CHAIN_NAME: process.env.ODRA_CASPER_LIVENET_CHAIN_NAME || "casper-test",
    ODRA_CASPER_LIVENET_SECRET_KEY_PATH: resolveSecretKeyPath(),
    ODRA_CASPER_LIVENET_EVENTS_URL: process.env.ODRA_CASPER_LIVENET_EVENTS_URL || "http://node.testnet.casper.network:9999/events/main",
  };
}

function runLivenetCmd(args: string[]): Promise<{ stdout: string; stderr: string; deployHash: string }> {
  return new Promise((resolve, reject) => {
    if (!existsSync(BIN)) {
      return reject(new Error(
        `Livenet binary not found at ${BIN}. ` +
        `Build it first: cd contracts/wardens_core && cargo build --features livenet --bin wardens_livenet`
      ));
    }
    const envs = getLivenetEnv();
    const child = spawn(BIN, args, { cwd: CONTRACT_DIR, env: envs });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Command failed (exit ${code}): ${stderr || stdout}`));
      }
      const combined = stdout + "\n" + stderr;
      const match =
        combined.match(/(?:deploy|transaction)\/([a-fA-F0-9]{64})/i) ||
        combined.match(/(?:deploy|transaction) hash:?\s*([a-fA-F0-9]{64})/i) ||
        combined.match(/(?:deploy|transaction)\s+"([a-fA-F0-9]{64})"/i);
      // Reject if no real on-chain deploy hash found — never fabricate a fake hash.
      if (!match) {
        return reject(new Error(
          `No deploy hash found in CLI output — the transaction may not have been submitted.\n` +
          `Raw output (last 600 chars): ${combined.slice(-600)}`
        ));
      }
      resolve({ stdout, stderr, deployHash: match[1] });
    });
  });
}

class WardensChainClient {
  assets = new Map<string, Asset>();
  agents = new Map<string, Agent>();
  scores = new Map<number, TrustScore>();
  assetScoreIds = new Map<string, number[]>();
  challenges = new Map<number, Challenge>();
  positions = new Map<string, VaultPosition>();
  scoreCount = 0;
  challengeCount = 0;
  txs: TxRecord[] = [];

  async createAsset(a: {
    asset_id: string;
    issuer: string;
    debtor: string;
    face_value: number;
    due_date: number;
    evidence_hash: string;
  }): Promise<TxRecord> {
    assertChainMode();
    const { syncAssetFromChain, trackAssetLocally, persistTransaction, replaceTransaction } = await import("./chainSync.ts");
    trackAssetLocally(a.asset_id);

    const placeholderHash = "cspr-" + a.evidence_hash.substring(7, 39);
    const queuedTx: TxRecord = {
      action: "create_asset",
      deploy_hash: placeholderHash,
      result: `Asset ${a.asset_id} queued on-chain`,
      timestamp: Date.now(),
    };

    // Optimistically add to read model so UI can show it immediately
    const now = Date.now();
    this.assets.set(a.asset_id, {
      ...a,
      status: "Active",
      current_score: 0,
      created_at: now,
      updated_at: now,
    });
    this.txs.push(queuedTx);
    persistTransaction(queuedTx);

    // Submit to Casper Testnet — runs async, replaces placeholder when confirmed
    runLivenetCmd([
      "create_asset",
      a.asset_id,
      a.issuer,
      a.debtor,
      a.face_value.toString(),
      a.due_date.toString(),
      a.evidence_hash,
    ]).then(async ({ deployHash }) => {
      console.log(`[casperClient] ✓ Asset ${a.asset_id} on-chain: ${deployHash}`);
      await syncAssetFromChain(a.asset_id);
      const realTx: TxRecord = {
        action: "create_asset",
        deploy_hash: deployHash,
        result: `Asset ${a.asset_id} created`,
        timestamp: queuedTx.timestamp,
      };
      const memIdx = this.txs.findIndex((t) => t.deploy_hash === placeholderHash);
      if (memIdx >= 0) this.txs[memIdx] = realTx; else this.txs.push(realTx);
      replaceTransaction(placeholderHash, realTx);
    }).catch((e) => console.error(`[casperClient] createAsset on-chain error:`, e));

    return queuedTx;
  }

  async registerAgent(agent_id: string, role: string): Promise<TxRecord> {
    assertChainMode();
    const { persistTransaction, replaceTransaction } = await import("./chainSync.ts");

    // Optimistically seed into read model
    this.agents.set(agent_id, {
      agent_id,
      role,
      bonded_amount: 0,
      reputation: 100,
      total_reports: 0,
      successful_reports: 0,
      slashed_count: 0,
      active: true,
      x402_price: 1_000_000,
    });

    const placeholderHash = `cspr-reg-${Date.now()}`;
    const queuedTx: TxRecord = {
      action: "register_agent",
      deploy_hash: placeholderHash,
      result: `Agent ${agent_id} queued on-chain`,
      timestamp: Date.now(),
    };
    this.txs.push(queuedTx);
    persistTransaction(queuedTx);

    runLivenetCmd(["register_agent", agent_id, role.toLowerCase()])
      .then(async ({ deployHash }) => {
        console.log(`[casperClient] ✓ Agent ${agent_id} registered on-chain: ${deployHash}`);
        const realTx: TxRecord = {
          action: "register_agent",
          deploy_hash: deployHash,
          result: `Agent ${agent_id} registered`,
          timestamp: queuedTx.timestamp,
        };
        const memIdx = this.txs.findIndex((t) => t.deploy_hash === placeholderHash);
        if (memIdx >= 0) this.txs[memIdx] = realTx; else this.txs.push(realTx);
        replaceTransaction(placeholderHash, realTx);
      })
      .catch((e) => console.error(`[casperClient] registerAgent on-chain error:`, e));

    return queuedTx;
  }

  async postBond(agent_id: string, amount: number): Promise<TxRecord> {
    assertChainMode();
    const { persistTransaction, replaceTransaction } = await import("./chainSync.ts");

    // Optimistically update read model
    const agent = this.agents.get(agent_id);
    if (agent) {
      agent.bonded_amount += amount;
      agent.active = true;
    }

    const placeholderHash = `cspr-bond-${Date.now()}`;
    const queuedTx: TxRecord = {
      action: "post_bond",
      deploy_hash: placeholderHash,
      result: `Bond ${amount} queued on-chain`,
      timestamp: Date.now(),
    };
    this.txs.push(queuedTx);
    persistTransaction(queuedTx);

    runLivenetCmd(["post_bond", agent_id, amount.toString()])
      .then(async ({ deployHash }) => {
        console.log(`[casperClient] ✓ Bond ${amount} posted for ${agent_id}: ${deployHash}`);
        const realTx: TxRecord = {
          action: "post_bond",
          deploy_hash: deployHash,
          result: `Bond ${amount} locked`,
          timestamp: queuedTx.timestamp,
        };
        const memIdx = this.txs.findIndex((t) => t.deploy_hash === placeholderHash);
        if (memIdx >= 0) this.txs[memIdx] = realTx; else this.txs.push(realTx);
        replaceTransaction(placeholderHash, realTx);
      })
      .catch((e) => console.error(`[casperClient] postBond on-chain error:`, e));

    return queuedTx;
  }

  async submitScore(s: {
    asset_id: string;
    score: number;
    agent_id: string;
    evidence_hash: string;
    explanation_hash: string;
  }): Promise<TxRecord & { score_id: number }> {
    assertChainMode();
    const { stdout, deployHash } = await runLivenetCmd([
      "submit_score",
      s.asset_id,
      s.score.toString(),
      s.agent_id,
      s.evidence_hash,
      s.explanation_hash,
    ]);
    const scoreIdMatch = stdout.match(/SCORE_ID=(\d+)/);
    const score_id = scoreIdMatch ? Number(scoreIdMatch[1]) : 0;

    const { syncAssetFromChain, persistTransaction } = await import("./chainSync.ts");
    await syncAssetFromChain(s.asset_id);

    const tx: TxRecord = {
      action: "submit_score",
      deploy_hash: deployHash,
      result: `Score ${s.score}`,
      timestamp: Date.now(),
    };
    this.txs.push(tx);
    persistTransaction(tx);

    // Update in-memory scores so LTV/status is fresh
    this.scoreCount += 1;
    const sid = score_id || this.scoreCount;
    const now = Date.now();
    this.scores.set(sid, {
      score_id: sid,
      asset_id: s.asset_id,
      score: s.score,
      agent_id: s.agent_id,
      evidence_hash: s.evidence_hash,
      explanation_hash: s.explanation_hash,
      timestamp: now,
      challenge_deadline: now + STALENESS_WINDOW_SECONDS * 1000,
      challenged: false,
    });
    const ids = this.assetScoreIds.get(s.asset_id) ?? [];
    ids.push(sid);
    this.assetScoreIds.set(s.asset_id, ids);

    const asset = this.assets.get(s.asset_id);
    if (asset) {
      asset.current_score = s.score;
      asset.status = statusForScore(s.score);
      asset.updated_at = now;
    }

    return { ...tx, score_id: sid };
  }

  async depositCollateral(asset_id: string, collateral_value: number): Promise<TxRecord> {
    assertChainMode();
    const { deployHash } = await runLivenetCmd([
      "deposit_collateral",
      asset_id,
      collateral_value.toString(),
    ]);
    const { syncAssetFromChain, persistTransaction } = await import("./chainSync.ts");
    await syncAssetFromChain(asset_id);

    const asset = this.assets.get(asset_id);
    const ltv = asset ? ltvForScore(asset.current_score) : 0;
    this.positions.set(asset_id, {
      asset_id,
      collateral_value,
      borrowed_amount: 0,
      current_ltv: ltv,
      frozen: asset?.status === "Frozen" || ltv === 0,
    });

    const tx: TxRecord = {
      action: "deposit_collateral",
      deploy_hash: deployHash,
      result: `Collateral ${collateral_value}`,
      timestamp: Date.now(),
    };
    this.txs.push(tx);
    persistTransaction(tx);
    return tx;
  }

  isStale(asset_id: string): boolean {
    const ids = this.assetScoreIds.get(asset_id) ?? [];
    if (ids.length === 0) return true;
    const latest = this.scores.get(ids[ids.length - 1]!)!;
    return Date.now() - latest.timestamp > STALENESS_WINDOW_SECONDS * 1000;
  }

  currentLtv(asset_id: string): number {
    const asset = this.assets.get(asset_id);
    if (!asset || asset.status === "Frozen" || this.isStale(asset_id)) return 0;
    return ltvForScore(asset.current_score);
  }

  async borrow(asset_id: string, amount: number): Promise<TxRecord> {
    assertChainMode();
    const { deployHash } = await runLivenetCmd([
      "borrow",
      asset_id,
      amount.toString(),
    ]);
    const { syncAssetFromChain, persistTransaction } = await import("./chainSync.ts");
    await syncAssetFromChain(asset_id);

    const pos = this.positions.get(asset_id);
    if (pos) pos.borrowed_amount += amount;

    const tx: TxRecord = {
      action: "borrow",
      deploy_hash: deployHash,
      result: `Borrowed ${amount}`,
      timestamp: Date.now(),
    };
    this.txs.push(tx);
    persistTransaction(tx);
    return tx;
  }

  async openChallenge(c: {
    score_id: number;
    challenger_agent_id: string;
    counter_evidence_hash: string;
    counter_bond: number;
  }): Promise<TxRecord & { challenge_id: number }> {
    assertChainMode();
    const { stdout, deployHash } = await runLivenetCmd([
      "open_challenge",
      c.score_id.toString(),
      c.challenger_agent_id,
      c.counter_evidence_hash,
      c.counter_bond.toString(),
    ]);
    const challengeIdMatch = stdout.match(/CHALLENGE_ID=(\d+)/);
    const challenge_id = challengeIdMatch ? Number(challengeIdMatch[1]) : 0;

    const { syncAssetFromChain, persistTransaction } = await import("./chainSync.ts");
    const score = this.scores.get(c.score_id);
    const assetId = score ? score.asset_id : "";
    if (assetId) await syncAssetFromChain(assetId);

    const tx: TxRecord = {
      action: "open_challenge",
      deploy_hash: deployHash,
      result: `Challenge ${challenge_id} opened`,
      timestamp: Date.now(),
    };
    this.txs.push(tx);
    persistTransaction(tx);
    return { ...tx, challenge_id };
  }

  async resolveChallenge(challenge_id: number, upheld: boolean): Promise<TxRecord> {
    assertChainMode();
    const { deployHash } = await runLivenetCmd([
      "resolve_challenge",
      challenge_id.toString(),
      upheld.toString(),
    ]);
    const { syncAssetFromChain, persistTransaction } = await import("./chainSync.ts");
    const ch = this.challenges.get(challenge_id);
    const assetId = ch ? ch.asset_id : "";
    if (assetId) await syncAssetFromChain(assetId);

    const tx: TxRecord = {
      action: "resolve_challenge",
      deploy_hash: deployHash,
      result: upheld ? "Verifier slashed" : "Challenger slashed",
      timestamp: Date.now(),
    };
    this.txs.push(tx);
    persistTransaction(tx);
    return tx;
  }

  async releaseBond(agent_id: string): Promise<TxRecord> {
    assertChainMode();
    const { deployHash } = await runLivenetCmd([
      "release_bond",
      agent_id,
    ]);
    const { persistTransaction } = await import("./chainSync.ts");
    const agent = this.agents.get(agent_id);
    if (agent) {
      agent.bonded_amount = 0;
      agent.active = false;
    }
    const tx: TxRecord = {
      action: "release_bond",
      deploy_hash: deployHash,
      result: "Bond released",
      timestamp: Date.now(),
    };
    this.txs.push(tx);
    persistTransaction(tx);
    return tx;
  }

  private mustAsset(id: string): Asset {
    const a = this.assets.get(id);
    if (!a) throw new Error("AssetNotFound");
    return a;
  }
  private mustAgent(id: string): Agent {
    const a = this.agents.get(id);
    if (!a) throw new Error("AgentNotFound");
    return a;
  }
}

const MODE = process.env.WARDENS_MODE;
if (MODE !== "chain") {
  console.error(
    `[casperClient] FATAL: WARDENS_MODE="${MODE ?? "unset"}". ` +
    `This backend requires WARDENS_MODE=chain — no simulation fallback exists. ` +
    `Set the env variable and restart.`
  );
  // Don't process.exit here — let the error surface on first API call so PM2 can log it cleanly.
}

export const casper = new WardensChainClient();
export type CasperClient = WardensChainClient;
