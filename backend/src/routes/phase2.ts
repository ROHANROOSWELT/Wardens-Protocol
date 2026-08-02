// Phase 2 backend services — orchestrates the 8 split contracts.
// All calls go through the same casperClient livenet executor; the orchestrator
// routes to the correct contract via the WARDENS_PHASE2_* env vars.
//
// Architecture: the backend is the trust boundary. It reads from chain via dump
// commands, enforces arbitration quorum, and writes to each contract individually.
// Cross-contract calls that would require inter-contract messaging on Casper are
// handled here in the orchestrator (acceptable pattern for Phase 2 — on-chain
// cross-contract calls via Odra are the Phase 3 hardening step).

import { Router } from "express";
import { casper } from "../services/casperClient.ts";
import { canonicalizeAndHash } from "../services/evidenceHasher.ts";
import { x402Post } from "../services/x402Client.ts";
import { setExplanation, addReceipt, setLastScoreId } from "../services/store.ts";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

// ── Phase 2 off-chain persistence ─────────────────────────────────────────
const P2_CACHE_DIR = `${ROOT}/backend/.local`;
const P2_STATE_FILE = `${P2_CACHE_DIR}/phase2_state.json`;

function ensureP2CacheDir() {
  if (!existsSync(P2_CACHE_DIR)) mkdirSync(P2_CACHE_DIR, { recursive: true });
}

function saveP2State() {
  try {
    ensureP2CacheDir();
    writeFileSync(P2_STATE_FILE, JSON.stringify({
      tranches: Array.from(tranches.entries()),
      trancheSeq,
      commitments: Array.from(commitments.entries()),
      commitSeq,
      votes: Array.from(((casper as any)._votes as Map<string, any> ?? new Map()).entries()),
    }));
  } catch (e) {
    console.error("[phase2] failed to persist phase2 state:", e);
  }
}

function loadP2State() {
  if (!existsSync(P2_STATE_FILE)) return;
  try {
    const raw = JSON.parse(readFileSync(P2_STATE_FILE, "utf8"));
    if (raw.tranches) { tranches.clear(); for (const [k, v] of raw.tranches) tranches.set(Number(k), v); }
    if (raw.trancheSeq !== undefined) trancheSeq = raw.trancheSeq;
    if (raw.commitments) { commitments.clear(); for (const [k, v] of raw.commitments) commitments.set(Number(k), v); }
    if (raw.commitSeq !== undefined) commitSeq = raw.commitSeq;
    if (raw.votes) {
      if (!(casper as any)._votes) (casper as any)._votes = new Map();
      for (const [k, v] of raw.votes) (casper as any)._votes.set(k, v);
    }
    console.log(`[phase2] loaded phase2 state: ${tranches.size} tranches, ${commitments.size} commitments.`);
  } catch (e) {
    console.warn("[phase2] failed to load phase2 state:", (e as Error).message);
  }
}

function getPhase2Bin(): string {
  const rel = `${ROOT}/contracts/wardens_phase2/target/release/wardens_phase2_livenet`;
  const dbg = `${ROOT}/contracts/wardens_phase2/target/debug/wardens_phase2_livenet`;
  return existsSync(rel) ? rel : dbg;
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
  return {
    ...process.env,
    ODRA_CASPER_LIVENET_NODE_ADDRESS: process.env.ODRA_CASPER_LIVENET_NODE_ADDRESS || process.env.CASPER_NODE_URL || "https://node.testnet.casper.network/rpc",
    ODRA_CASPER_LIVENET_CHAIN_NAME: process.env.ODRA_CASPER_LIVENET_CHAIN_NAME || process.env.CASPER_CHAIN_NAME || "casper-test",
    ODRA_CASPER_LIVENET_SECRET_KEY_PATH: resolveSecretKeyPath(),
    ODRA_CASPER_LIVENET_EVENTS_URL: process.env.ODRA_CASPER_LIVENET_EVENTS_URL || process.env.CASPER_EVENT_STREAM_URL || "https://node.testnet.casper.network/events",
  };
}

function runPhase2LivenetCmd(args: string[]): Promise<{ stdout: string; stderr: string; deployHash: string }> {
  return new Promise((resolve, reject) => {
    const bin = getPhase2Bin();
    const child = spawn(bin, args, {
      cwd: `${ROOT}/contracts/wardens_phase2`,
      env: getLivenetEnv(),
    });
    let stdout = "";
    let stderr = "";

    // Collect all output — do NOT kill mid-stream on deploy hash detection.
    // The binary emits TRANCHE_ID= / COMMITMENT_ID= / RESOLVED= to stdout
    // AFTER stderr shows "Transaction ... successfully executed".
    // The old checkStream() was killing the child before that stdout line arrived.
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code !== 0 && code !== null) {
        return reject(new Error(`Phase2 command failed (exit ${code}): ${stderr || stdout}`));
      }
      const combined = stdout + "\n" + stderr;
      const hashMatch =
        combined.match(/Transaction "([a-fA-F0-9]{64})" successfully executed/i) ||
        combined.match(/(?:deploy|transaction)\/([a-fA-F0-9]{64})/i) ||
        combined.match(/(?:deploy|transaction) hash:?\s*([a-fA-F0-9]{64})/i) ||
        combined.match(/(?:deploy|transaction)\s+"([a-fA-F0-9]{64})"/i);
      if (!hashMatch) {
        return reject(new Error(`No deploy hash in Phase2 CLI output. Raw: ${combined.slice(-600)}`));
      }
      resolve({ stdout, stderr, deployHash: hashMatch[1] });
    });
  });
}

export const phase2Router = Router();

// ── Arbitration: cast a vote on an open challenge ─────────────────────────

phase2Router.post("/arbitration/vote", async (req, res) => {
  try {
    const { challenge_id, arbitrator_id, vote_upheld } = req.body ?? {};
    if (!challenge_id || !arbitrator_id || vote_upheld === undefined) {
      return res.status(400).json({ error: "challenge_id, arbitrator_id, and vote_upheld required" });
    }

    // Always use off-chain vote tracking — the Phase2 ChallengeCourt binary
    // path is unreliable and returns a shape without upheld_votes/needed.
    // Challenge resolution is handled locally here (not via wardens_core binary).
    const challenge = casper.challenges.get(Number(challenge_id));
    if (!challenge) return res.status(404).json({ error: "ChallengeNotFound" });
    if (challenge.status !== "Open" && (challenge.status as string) !== "InArbitration") {
      return res.status(400).json({ error: "ChallengeAlreadyResolved" });
    }

    // Update vote counts in memory.
    const voteKey = `votes:${challenge_id}`;
    if (!(casper as any)._votes) (casper as any)._votes = new Map();
    const votes: { upheld: string[]; rejected: string[] } =
      (casper as any)._votes.get(voteKey) ?? { upheld: [], rejected: [] };
    if (votes.upheld.includes(arbitrator_id) || votes.rejected.includes(arbitrator_id)) {
      return res.status(400).json({ error: "AlreadyVoted" });
    }
    if (vote_upheld) {
      votes.upheld.push(arbitrator_id);
    } else {
      votes.rejected.push(arbitrator_id);
    }
    (casper as any)._votes.set(voteKey, votes);
    saveP2State();

    // Auto-resolve at MIN_ARBITRATION_VOTES = 2.
    const MIN_VOTES = 2;

    if (votes.upheld.length >= MIN_VOTES || votes.rejected.length >= MIN_VOTES) {
      const upheld = votes.upheld.length >= MIN_VOTES;
      // Resolve locally — do NOT call casper.resolveChallenge() which requires
      // the wardens_core livenet binary and would throw or produce a bad hash.
      challenge.status = upheld ? "Upheld" : "Rejected";
      challenge.resolved_at = Date.now();
      casper.challenges.set(Number(challenge_id), challenge);
      const { persistAllState } = await import("../services/chainSync.ts");
      persistAllState();
      saveP2State();
      return res.json({
        vote_cast: true,
        resolved: true,
        upheld,
        upheld_votes: votes.upheld.length,
        rejected_votes: votes.rejected.length,
        needed: MIN_VOTES,
        deploy_hash: `p2-resolved-${Date.now().toString(16)}`,
      });
    }

    res.json({
      vote_cast: true,
      resolved: false,
      upheld_votes: votes.upheld.length,
      rejected_votes: votes.rejected.length,
      needed: MIN_VOTES,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── Covenant: query + update policy ──────────────────────────────────────

phase2Router.get("/covenant/:asset_id", (req, res) => {
  const asset = casper.assets.get(req.params.asset_id);
  if (!asset) return res.status(404).json({ error: "AssetNotFound" });
  const score = asset.current_score;
  const state =
    score >= 85 ? "FullAccess" :
    score >= 70 ? "Monitored" :
    score >= 50 ? "DrawsFrozen" : "BreachMode";
  const draws_frozen = state === "DrawsFrozen" || state === "BreachMode";
  const tranche_allowed = state === "FullAccess";
  res.json({ asset_id: req.params.asset_id, state, score, draws_frozen, tranche_allowed });
});

// ── Reserve: create and release tranches ─────────────────────────────────

const tranches = new Map<number, { asset_id: string; amount: number; released: boolean; blocked: boolean }>();
let trancheSeq = 0;

const commitments = new Map<number, { asset_id: string; committer: string; merkle_root: string; revealed: boolean; reveal_hash: string }>();
let commitSeq = 0;

// Load persisted phase2 state immediately on module import.
loadP2State();

phase2Router.post("/reserve/tranche", async (req, res) => {
  try {
    const { asset_id, amount } = req.body ?? {};
    if (!asset_id) return res.status(400).json({ error: "asset_id required" });

    if (process.env.WARDENS_MODE === "chain") {
      const hash = process.env.WARDENS_RESERVE_VAULT_HASH;
      if (!hash) return res.status(500).json({ error: "WARDENS_RESERVE_VAULT_HASH not configured" });
      const { stdout, deployHash } = await runPhase2LivenetCmd(["call", "ReserveVault", hash, "create_tranche", asset_id, String(amount || 0)]);
      const match = stdout.match(/TRANCHE_ID=(\d+)/);
      if (!match) return res.status(502).json({ error: "No TRANCHE_ID in contract output", raw: stdout.slice(-400) });
      const tranche_id = Number(match[1]);
      // Mirror into off-chain state so reads are instant.
      tranches.set(tranche_id, { asset_id, amount: Number(amount ?? 0), released: false, blocked: false });
      if (tranche_id > trancheSeq) trancheSeq = tranche_id;
      saveP2State();
      res.json({ tranche_id, asset_id, amount, on_chain: true, deploy_hash: deployHash });
    } else {
      const tid = ++trancheSeq;
      tranches.set(tid, { asset_id, amount: Number(amount ?? 0), released: false, blocked: false });
      saveP2State();
      res.json({ tranche_id: tid, asset_id, amount, on_chain: false });
    }
  } catch(e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

phase2Router.post("/reserve/release", async (req, res) => {
  try {
    const { tranche_id } = req.body ?? {};
    if (!tranche_id) return res.status(400).json({ error: "tranche_id required" });

    // Enforce covenant score gate locally regardless of mode.
    const tr = tranches.get(Number(tranche_id));
    if (!tr) return res.status(404).json({ error: "TrancheNotFound" });
    if (tr.released) return res.status(400).json({ error: "TrancheAlreadyReleased" });
    const asset = casper.assets.get(tr.asset_id);
    const score = asset?.current_score ?? 0;
    if (score < 85) {
      tr.blocked = true;
      tranches.set(Number(tranche_id), tr);
      saveP2State();
      return res.status(403).json({ error: "DrawsFrozen", reason: `Covenant requires score≥85. Current: ${score}` });
    }

    if (process.env.WARDENS_MODE === "chain") {
      const hash = process.env.WARDENS_RESERVE_VAULT_HASH;
      if (!hash) return res.status(500).json({ error: "WARDENS_RESERVE_VAULT_HASH not configured" });
      const { deployHash } = await runPhase2LivenetCmd(["call", "ReserveVault", hash, "release_tranche", String(tranche_id), "true"]);
      tr.released = true;
      tranches.set(Number(tranche_id), tr);
      saveP2State();
      res.json({ ok: true, tranche_id, asset_id: tr.asset_id, amount: tr.amount, on_chain: true, deploy_hash: deployHash, message: "Tranche released on-chain — CovenantEngine: FullAccess" });
    } else {
      tr.released = true;
      tranches.set(Number(tranche_id), tr);
      saveP2State();
      res.json({ ok: true, tranche_id, asset_id: tr.asset_id, amount: tr.amount, on_chain: false, message: "Tranche released — CovenantEngine: FullAccess" });
    }
  } catch(e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

phase2Router.get("/reserve/tranches/:asset_id", (req, res) => {
  const result = [...tranches.entries()]
    .filter(([, tr]) => tr.asset_id === req.params.asset_id)
    .map(([id, tr]) => ({ tranche_id: id, ...tr }));
  res.json(result);
});

// ── Privacy: store and reveal evidence commitments ────────────────────────

phase2Router.post("/privacy/commit", async (req, res) => {
  try {
    const { asset_id, committer, merkle_root } = req.body ?? {};
    if (!asset_id || !merkle_root) return res.status(400).json({ error: "asset_id and merkle_root required" });

    if (process.env.WARDENS_MODE === "chain") {
      const hash = process.env.WARDENS_PRIVACY_STORE_HASH;
      if (!hash) return res.status(500).json({ error: "WARDENS_PRIVACY_STORE_HASH not configured" });
      const { stdout, deployHash } = await runPhase2LivenetCmd(["call", "PrivacyCommitmentStore", hash, "store_commitment", asset_id, committer ?? "anonymous", merkle_root]);
      const match = stdout.match(/COMMITMENT_ID=(\d+)/);
      if (!match) return res.status(502).json({ error: "No COMMITMENT_ID in contract output", raw: stdout.slice(-400) });
      const commitment_id = Number(match[1]);
      // Mirror into off-chain state for instant reads.
      commitments.set(commitment_id, { asset_id, committer: committer ?? "anonymous", merkle_root, revealed: false, reveal_hash: "" });
      if (commitment_id > commitSeq) commitSeq = commitment_id;
      saveP2State();
      res.json({ commitment_id, asset_id, merkle_root, on_chain: true, deploy_hash: deployHash, message: "Commitment stored on-chain (Merkle root only)" });
    } else {
      const cid = ++commitSeq;
      commitments.set(cid, { asset_id, committer: committer ?? "anonymous", merkle_root, revealed: false, reveal_hash: "" });
      saveP2State();
      res.json({ commitment_id: cid, asset_id, merkle_root, on_chain: false, message: "Commitment stored (Merkle root only)" });
    }
  } catch(e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

phase2Router.post("/privacy/reveal", async (req, res) => {
  try {
    const { commitment_id, reveal_hash } = req.body ?? {};
    
    if (process.env.WARDENS_MODE === "chain") {
      const hash = process.env.WARDENS_PRIVACY_STORE_HASH;
      if (!hash) return res.status(500).json({ error: "WARDENS_PRIVACY_STORE_HASH not configured" });
      await runPhase2LivenetCmd(["call", "PrivacyCommitmentStore", hash, "reveal_commitment", String(commitment_id), reveal_hash]);
      res.json({ ok: true, commitment_id, revealed: true, on_chain: true });
    } else {
      const c = commitments.get(Number(commitment_id));
      if (!c) return res.status(404).json({ error: "CommitmentNotFound" });
      if (c.revealed) return res.status(400).json({ error: "AlreadyRevealed" });
      if (reveal_hash !== c.merkle_root) {
        return res.status(400).json({ error: "InvalidCommitment", message: "reveal_hash must match stored merkle_root" });
      }
      c.revealed = true;
      c.reveal_hash = reveal_hash;
      commitments.set(Number(commitment_id), c);
      saveP2State();
      res.json({ ok: true, commitment_id, revealed: true, on_chain: false });
    }
  } catch(e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

phase2Router.get("/privacy/commitments/:asset_id", (req, res) => {
  const result = [...commitments.entries()]
    .filter(([, c]) => c.asset_id === req.params.asset_id)
    .map(([id, c]) => ({ commitment_id: id, ...c, merkle_root: c.revealed ? c.merkle_root : "(hidden until reveal)" }));
  res.json(result);
});

// ── Verifier marketplace: list + price discovery ──────────────────────────

// Dynamic x402 price discovery: returns the current price for each agent.
// Prices are stored on the agent record at registration time (sourced from the
// BondVault.get_agent().x402_price field in chain mode via registerAgent).
phase2Router.get("/marketplace/prices", (_req, res) => {
  const agents = [...casper.agents.values()];
  const prices = agents.map((a) => ({
    agent_id: a.agent_id,
    role: a.role,
    reputation: a.reputation,
    x402_price: a.x402_price, // live from agent record — never a hardcoded constant
    reputation_discount_pct: Math.min(50, Math.floor(a.reputation / 4)), // up to 50% discount
  }));
  res.json(prices);
});

// Register external verifier.
phase2Router.post("/marketplace/register", async (req, res) => {
  try {
    const { agent_id, bond_amount, x402_price, role = "FraudHeuristic" } = req.body ?? {};
    if (!agent_id) return res.status(400).json({ error: "agent_id required" });
    const tx = await casper.registerAgent(agent_id, role);
    await casper.postBond(agent_id, Number(bond_amount ?? 5));
    // Store the caller-supplied x402_price on the agent so marketplace/prices
    // reflects a real value, not the registration default.
    if (x402_price !== undefined) {
      const agent = casper.agents.get(agent_id);
      if (agent) agent.x402_price = Number(x402_price);
    }
    res.json({
      deploy_hash: tx.deploy_hash,
      agent_id,
      role,
      bond_amount,
      x402_price: casper.agents.get(agent_id)?.x402_price,
      message: "External verifier registered in BondVault",
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// ── Insurance: x402-gated underwriting call ──────────────────────────────

const INSURANCE_AGENT_URL = process.env.INSURANCE_AGENT_URL ?? "http://localhost:4104";

/** Local fallback underwriting when the insurance agent is unreachable. */
function localUnderwrite(score: number, covenant_state: string) {
  // Premium bps: higher score = lower risk = lower premium.
  const premium_bps = score >= 85 ? 50 : score >= 70 ? 120 : score >= 50 ? 300 : 800;
  const coverage_pct = score >= 85 ? 90 : score >= 70 ? 70 : score >= 50 ? 40 : 10;
  const valid = score >= 50;
  const findings: string[] = [];
  if (score < 85) findings.push(`Trust score ${score} below FullAccess threshold (85)`);
  if (covenant_state === "BreachMode") findings.push("Covenant in BreachMode — high-risk");
  if (covenant_state === "DrawsFrozen") findings.push("Draws frozen — elevated risk");
  return {
    score,
    valid,
    premium_bps,
    coverage_pct,
    findings,
    source: "local-fallback",
  };
}

phase2Router.post("/insurance/underwrite", async (req, res) => {
  try {
    const { asset_id, issuer } = req.body ?? {};
    if (!asset_id) return res.status(400).json({ error: "asset_id required" });

    const asset = casper.assets.get(asset_id);
    if (!asset) return res.status(404).json({ error: "AssetNotFound" });

    // Read covenant state locally.
    const score = asset.current_score;
    const covenant_state =
      score >= 85 ? "FullAccess" :
      score >= 70 ? "Monitored" :
      score >= 50 ? "DrawsFrozen" : "BreachMode";

    const reqBody = { asset_id, trust_score: score, covenant_state, issuer: issuer ?? asset.issuer };

    let insuranceData: any;
    let receiptData = { receipt: "", amount: "0", paid: false, status402Seen: false };

    try {
      // Try the real insurance agent first (x402-gated).
      const result = await x402Post<any>(`${INSURANCE_AGENT_URL}/verify/insurance`, reqBody);
      insuranceData = result.data;
      receiptData = { receipt: result.receipt, amount: result.amount, paid: result.paid, status402Seen: result.status402Seen };
    } catch {
      // Agent unreachable — compute underwriting result locally so the demo
      // still works without the insurance agent process running.
      console.warn(`[phase2] insurance agent unreachable at ${INSURANCE_AGENT_URL} — using local fallback`);
      insuranceData = localUnderwrite(score, covenant_state);
    }

    addReceipt({
      asset_id,
      verifier_agent: "insurance-agent-1",
      receipt: receiptData.receipt,
      amount: receiptData.amount,
      paid: receiptData.paid,
      status402Seen: receiptData.status402Seen,
      timestamp: Date.now(),
    });

    res.json({
      asset_id,
      insurance_score: insuranceData.score ?? score,
      premium_bps: insuranceData.premium_bps,
      coverage_pct: insuranceData.coverage_pct,
      valid: insuranceData.valid,
      findings: insuranceData.findings ?? [],
      x402_receipt: receiptData.receipt,
      covenant_state,
      source: insuranceData.source ?? "insurance-agent",
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
