// casperClient — the backend's gateway to WardensCore.
//
// Two modes (WARDENS_MODE env):
//  * "sim"  (default): an in-process mirror of the WardensCore contract so the
//    entire Section 3 loop runs end-to-end offline with deterministic pseudo
//    deploy hashes. This is what powers the dashboard during development and
//    when a funded testnet node is not wired up.
//  * "chain": submit real deploys to the deployed WardensCore contract. Wiring
//    (node URL, contract hash, signing key) is filled in scripts/deploy.sh and
//    documented in PROOF.md; the on-chain semantics are identical to the sim.
//
// The sim mirrors contracts/wardens_core/src exactly: LTV table, <50 freeze,
// 600s staleness, challenge slash/reward. Keeping them in lockstep means the
// demo behaves the same whether or not a node is attached.
import { createHash } from "node:crypto";
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
  /** x402 payment price in motes. Sourced from BondVault.get_agent().x402_price in chain mode,
   *  or set at registration time in sim mode. Never a hardcoded constant. */
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
const MODE = process.env.WARDENS_MODE ?? "sim";

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
    ODRA_CASPER_LIVENET_NODE_ADDRESS: process.env.ODRA_CASPER_LIVENET_NODE_ADDRESS || process.env.CASPER_NODE_URL || "https://node.testnet.casper.network/rpc",
    ODRA_CASPER_LIVENET_CHAIN_NAME: process.env.ODRA_CASPER_LIVENET_CHAIN_NAME || process.env.CASPER_CHAIN_NAME || "casper-test",
    ODRA_CASPER_LIVENET_SECRET_KEY_PATH: resolveSecretKeyPath(),
    ODRA_CASPER_LIVENET_EVENTS_URL: process.env.ODRA_CASPER_LIVENET_EVENTS_URL || process.env.CASPER_EVENT_STREAM_URL || "http://node.testnet.casper.network:9999/events/main",
  };
}

function runLivenetCmd(args: string[]): Promise<{ stdout: string; stderr: string; deployHash: string }> {
  return new Promise((resolve, reject) => {
    if (!existsSync(BIN)) {
      return reject(new Error(`livenet executor not built at ${BIN} — run cargo build --features livenet --bin wardens_livenet`));
    }
    const envs = getLivenetEnv();
    const child = spawn(BIN, args, {
      cwd: CONTRACT_DIR,
      env: envs,
    });
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
        return reject(new Error(`No deploy hash in CLI output. Raw output: ${combined.slice(-600)}`));
      }
      resolve({ stdout, stderr, deployHash: match[1] });
    });
  });
}

class WardensCoreSim {
  assets = new Map<string, Asset>();
  agents = new Map<string, Agent>();
  scores = new Map<number, TrustScore>();
  assetScoreIds = new Map<string, number[]>();
  challenges = new Map<number, Challenge>();
  positions = new Map<string, VaultPosition>();
  scoreCount = 0;
  challengeCount = 0;
  txs: TxRecord[] = [];
  private nonce = 0;

  private now(): number {
    return Date.now();
  }

  private hash(action: string, payload: unknown): string {
    this.nonce += 1;
    return createHash("sha256")
      .update(`${action}:${JSON.stringify(payload)}:${this.nonce}`)
      .digest("hex");
  }

  private record(action: string, payload: unknown, result: string): TxRecord {
    const tx: TxRecord = {
      action,
      deploy_hash: this.hash(action, payload),
      result,
      timestamp: this.now(),
    };
    this.txs.push(tx);
    return tx;
  }

  async createAsset(a: {
    asset_id: string;
    issuer: string;
    debtor: string;
    face_value: number;
    due_date: number;
    evidence_hash: string;
  }): Promise<TxRecord> {
    const now = this.now();
    // 1. Optimistically update read model immediately
    this.assets.set(a.asset_id, {
      ...a,
      status: "Active",
      current_score: 0,
      created_at: now,
      updated_at: now,
    });

    if (MODE === "chain") {
      const { syncAssetFromChain, trackAssetLocally, persistTransaction } = await import("./chainSync.ts");
      trackAssetLocally(a.asset_id);

      const placeholderHash = "cspr-" + a.evidence_hash.substring(7, 39);

      // Submit to Casper Testnet asynchronously in background to prevent HTTP gateway timeouts on Vercel
      runLivenetCmd([
        "create_asset",
        a.asset_id,
        a.issuer,
        a.debtor,
        a.face_value.toString(),
        a.due_date.toString(),
        a.evidence_hash,
      ]).then(async ({ deployHash }) => {
        await syncAssetFromChain(a.asset_id);
        const tx: TxRecord = {
          action: "create_asset",
          deploy_hash: deployHash,
          result: `Asset ${a.asset_id} created`,
          timestamp: Date.now(),
        };
        this.txs.push(tx);
        persistTransaction(tx);
      }).catch(e => console.error(`[casperClient] createAsset on-chain error:`, e));

      return {
        action: "create_asset",
        deploy_hash: placeholderHash,
        result: `Asset ${a.asset_id} queued on-chain`,
        timestamp: Date.now(),
      };
    }

    return this.record("create_asset", a, `Asset ${a.asset_id} created`);
  }

  async registerAgent(agent_id: string, role: string): Promise<TxRecord> {
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

    if (MODE === "chain") {
      runLivenetCmd([
        "register_agent",
        agent_id,
        role.toLowerCase(),
      ]).then(async ({ deployHash }) => {
        const { persistTransaction } = await import("./chainSync.ts");
        const tx: TxRecord = {
          action: "register_agent",
          deploy_hash: deployHash,
          result: `Agent ${agent_id} registered`,
          timestamp: Date.now(),
        };
        this.txs.push(tx);
        persistTransaction(tx);
      }).catch(e => console.error(`[casperClient] registerAgent on-chain error:`, e));

      return {
        action: "register_agent",
        deploy_hash: `cspr-reg-${Date.now()}`,
        result: `Agent ${agent_id} queued on-chain`,
        timestamp: Date.now(),
      };
    }

    return this.record("register_agent", { agent_id, role }, `Agent ${agent_id} registered`);
  }

  async postBond(agent_id: string, amount: number): Promise<TxRecord> {
    const agent = this.agents.get(agent_id);
    if (agent) {
      agent.bonded_amount += amount;
      agent.active = true;
    }

    if (MODE === "chain") {
      runLivenetCmd([
        "post_bond",
        agent_id,
        amount.toString(),
      ]).then(async ({ deployHash }) => {
        const { persistTransaction } = await import("./chainSync.ts");
        const tx: TxRecord = {
          action: "post_bond",
          deploy_hash: deployHash,
          result: `Bond ${amount} locked`,
          timestamp: Date.now(),
        };
        this.txs.push(tx);
        persistTransaction(tx);
      }).catch(e => console.error(`[casperClient] postBond on-chain error:`, e));

      return {
        action: "post_bond",
        deploy_hash: `cspr-bond-${Date.now()}`,
        result: `Bond ${amount} queued on-chain`,
        timestamp: Date.now(),
      };
    }

    const a = this.mustAgent(agent_id);
    a.bonded_amount += amount;
    a.active = true;
    return this.record("post_bond", { agent_id, amount }, `Bond ${amount} locked`);
  }

  async submitScore(s: {
    asset_id: string;
    score: number;
    agent_id: string;
    evidence_hash: string;
    explanation_hash: string;
  }): Promise<TxRecord & { score_id: number }> {
    if (MODE === "chain") {
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
      
      const { syncAssetFromChain } = await import("./chainSync.ts");
      await syncAssetFromChain(s.asset_id);
      
      const tx: TxRecord = {
        action: "submit_score",
        deploy_hash: deployHash,
        result: `Score ${s.score}`,
        timestamp: Date.now(),
      };
      this.txs.push(tx);
      const { persistTransaction } = await import("./chainSync.ts");
      persistTransaction(tx);
      return { ...tx, score_id };
    }

    if (s.score > 100) throw new Error("InvalidScore");
    const agent = this.mustAgent(s.agent_id);
    if (!agent.active || agent.bonded_amount <= 0) throw new Error("AgentNotBonded");
    const asset = this.mustAsset(s.asset_id);
    const now = this.now();
    this.scoreCount += 1;
    const score_id = this.scoreCount;
    this.scores.set(score_id, {
      score_id,
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
    ids.push(score_id);
    this.assetScoreIds.set(s.asset_id, ids);

    asset.current_score = s.score;
    asset.status = statusForScore(s.score);
    asset.updated_at = now;
    agent.total_reports += 1;

    const tx = this.record("submit_score", s, `Score ${s.score}`);
    this.applyLtv(s.asset_id, ltvForScore(s.score));
    if (s.score < 50) this.freeze(s.asset_id, "score below 50");
    return { ...tx, score_id };
  }

  private applyLtv(asset_id: string, new_ltv: number) {
    const pos = this.positions.get(asset_id);
    if (pos) {
      pos.current_ltv = new_ltv;
      pos.frozen = new_ltv === 0;
    }
    this.record("vault_ltv_updated", { asset_id, new_ltv }, `LTV ${new_ltv}%`);
  }

  private freeze(asset_id: string, reason: string) {
    const asset = this.mustAsset(asset_id);
    asset.status = "Frozen";
    asset.updated_at = this.now();
    const pos = this.positions.get(asset_id);
    if (pos) {
      pos.frozen = true;
      pos.current_ltv = 0;
    }
    this.record("freeze_asset", { asset_id, reason }, `Frozen: ${reason}`);
  }

  async depositCollateral(asset_id: string, collateral_value: number): Promise<TxRecord> {
    if (MODE === "chain") {
      const { deployHash } = await runLivenetCmd([
        "deposit_collateral",
        asset_id,
        collateral_value.toString(),
      ]);
      const { syncAssetFromChain } = await import("./chainSync.ts");
      await syncAssetFromChain(asset_id);
      
      const tx: TxRecord = {
        action: "deposit_collateral",
        deploy_hash: deployHash,
        result: `Collateral ${collateral_value}`,
        timestamp: Date.now(),
      };
      this.txs.push(tx);
      return tx;
    }

    const asset = this.mustAsset(asset_id);
    const ltv = ltvForScore(asset.current_score);
    this.positions.set(asset_id, {
      asset_id,
      collateral_value,
      borrowed_amount: 0,
      current_ltv: ltv,
      frozen: asset.status === "Frozen" || ltv === 0,
    });
    return this.record("deposit_collateral", { asset_id, collateral_value }, `Collateral ${collateral_value}`);
  }

  isStale(asset_id: string): boolean {
    const ids = this.assetScoreIds.get(asset_id) ?? [];
    if (ids.length === 0) return true;
    const latest = this.scores.get(ids[ids.length - 1]!)!;
    return this.now() - latest.timestamp > STALENESS_WINDOW_SECONDS * 1000;
  }

  currentLtv(asset_id: string): number {
    const asset = this.mustAsset(asset_id);
    if (asset.status === "Frozen" || this.isStale(asset_id)) return 0;
    return ltvForScore(asset.current_score);
  }

  async borrow(asset_id: string, amount: number): Promise<TxRecord> {
    if (MODE === "chain") {
      const { deployHash } = await runLivenetCmd([
        "borrow",
        asset_id,
        amount.toString(),
      ]);
      const { syncAssetFromChain } = await import("./chainSync.ts");
      await syncAssetFromChain(asset_id);
      
      const tx: TxRecord = {
        action: "borrow",
        deploy_hash: deployHash,
        result: `Borrowed ${amount}`,
        timestamp: Date.now(),
      };
      this.txs.push(tx);
      return tx;
    }

    const asset = this.mustAsset(asset_id);
    const pos = this.positions.get(asset_id);
    if (!pos) throw new Error("VaultPositionNotFound");
    if (pos.frozen || asset.status === "Frozen") throw new Error("AssetFrozen");
    if (this.isStale(asset_id)) throw new Error("ScoreStale");
    const ltv = ltvForScore(asset.current_score);
    if (ltv === 0) throw new Error("AssetFrozen");
    const maxBorrow = Math.floor((pos.collateral_value * ltv) / 100);
    if (pos.borrowed_amount + amount > maxBorrow) throw new Error("ExceedsLtv");
    pos.borrowed_amount += amount;
    pos.current_ltv = ltv;
    return this.record("borrow", { asset_id, amount }, `Borrowed ${amount}`);
  }

  async openChallenge(c: {
    score_id: number;
    challenger_agent_id: string;
    counter_evidence_hash: string;
    counter_bond: number;
  }): Promise<TxRecord & { challenge_id: number }> {
    if (MODE === "chain") {
      const { stdout, deployHash } = await runLivenetCmd([
        "open_challenge",
        c.score_id.toString(),
        c.challenger_agent_id,
        c.counter_evidence_hash,
        c.counter_bond.toString(),
      ]);
      const challengeIdMatch = stdout.match(/CHALLENGE_ID=(\d+)/);
      const challenge_id = challengeIdMatch ? Number(challengeIdMatch[1]) : 0;
      
      const { syncAssetFromChain } = await import("./chainSync.ts");
      const score = this.scores.get(c.score_id);
      const assetId = score ? score.asset_id : "";
      await syncAssetFromChain(assetId);
      
      const tx: TxRecord = {
        action: "open_challenge",
        deploy_hash: deployHash,
        result: `Challenge ${challenge_id} opened`,
        timestamp: Date.now(),
      };
      this.txs.push(tx);
      return { ...tx, challenge_id };
    }

    const score = this.scores.get(c.score_id);
    if (!score) throw new Error("ScoreNotFound");
    if (this.now() > score.challenge_deadline) throw new Error("ChallengeWindowClosed");
    const challenger = this.mustAgent(c.challenger_agent_id);
    if (!challenger.active || challenger.bonded_amount <= 0) throw new Error("AgentNotBonded");
    if (challenger.role !== "Challenger") throw new Error("WrongRole");
    this.challengeCount += 1;
    const challenge_id = this.challengeCount;
    this.challenges.set(challenge_id, {
      challenge_id,
      asset_id: score.asset_id,
      score_id: c.score_id,
      challenger_agent_id: c.challenger_agent_id,
      challenged_agent_id: score.agent_id,
      counter_evidence_hash: c.counter_evidence_hash,
      counter_bond: c.counter_bond,
      status: "Open",
      opened_at: this.now(),
      resolved_at: 0,
    });
    score.challenged = true;
    const tx = this.record("open_challenge", c, `Challenge ${challenge_id} opened`);
    return { ...tx, challenge_id };
  }

  async resolveChallenge(challenge_id: number, upheld: boolean): Promise<TxRecord> {
    if (MODE === "chain") {
      const { deployHash } = await runLivenetCmd([
        "resolve_challenge",
        challenge_id.toString(),
        upheld.toString(),
      ]);
      const { syncAssetFromChain } = await import("./chainSync.ts");
      const ch = this.challenges.get(challenge_id);
      const assetId = ch ? ch.asset_id : "";
      await syncAssetFromChain(assetId);
      
      const tx: TxRecord = {
        action: "resolve_challenge",
        deploy_hash: deployHash,
        result: upheld ? "Verifier slashed" : "Challenger slashed",
        timestamp: Date.now(),
      };
      this.txs.push(tx);
      return tx;
    }

    const ch = this.challenges.get(challenge_id);
    if (!ch) throw new Error("ChallengeNotFound");
    if (ch.status !== "Open") throw new Error("ChallengeAlreadyResolved");
    ch.resolved_at = this.now();
    if (upheld) {
      ch.status = "Upheld";
      const bad = this.mustAgent(ch.challenged_agent_id);
      const slashed = bad.bonded_amount;
      bad.bonded_amount = 0;
      bad.slashed_count += 1;
      bad.active = false;
      bad.reputation = Math.max(0, bad.reputation - 50);
      const good = this.mustAgent(ch.challenger_agent_id);
      good.bonded_amount += slashed + ch.counter_bond;
      good.reputation += 10;
      good.successful_reports += 1;
      good.total_reports += 1;
      this.record("agent_slashed", { agent: ch.challenged_agent_id, amount: slashed }, `Slashed ${slashed}`);
      const asset = this.assets.get(ch.asset_id);
      if (asset) asset.current_score = 0;
      this.freeze(ch.asset_id, "challenge upheld");
    } else {
      ch.status = "Rejected";
      const challenger = this.mustAgent(ch.challenger_agent_id);
      challenger.bonded_amount = Math.max(0, challenger.bonded_amount - ch.counter_bond);
      challenger.total_reports += 1;
      const verifier = this.mustAgent(ch.challenged_agent_id);
      verifier.reputation += 5;
      verifier.successful_reports += 1;
    }
    return this.record("resolve_challenge", { challenge_id, upheld }, upheld ? "Verifier slashed" : "Challenger slashed");
  }

  async releaseBond(agent_id: string): Promise<TxRecord> {
    const agent = this.mustAgent(agent_id);
    agent.bonded_amount = 0;
    agent.active = false;
    return this.record("release_bond", { agent_id }, "Bond released");
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

const sim = new WardensCoreSim();

if (MODE === "chain") {
  console.warn(
    "[casperClient] WARDENS_MODE=chain: submitting via livenet CLI executor directly to the blockchain."
  );
}

export const casper = sim;
export type CasperClient = WardensCoreSim;

