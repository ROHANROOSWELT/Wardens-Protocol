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
import { computeScore } from "../services/scoreEngine.ts";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const BIN = `${ROOT}/contracts/wardens_phase2/target/debug/wardens_phase2_livenet`;

function getLivenetEnv() {
  return {
    ...process.env,
    ODRA_CASPER_LIVENET_NODE_ADDRESS: process.env.ODRA_CASPER_LIVENET_NODE_ADDRESS || process.env.CASPER_NODE_URL || "",
    ODRA_CASPER_LIVENET_CHAIN_NAME: process.env.ODRA_CASPER_LIVENET_CHAIN_NAME || process.env.CASPER_CHAIN_NAME || "",
    ODRA_CASPER_LIVENET_SECRET_KEY_PATH: process.env.ODRA_CASPER_LIVENET_SECRET_KEY_PATH || process.env.BACKEND_PRIVATE_KEY_PATH || "",
    ODRA_CASPER_LIVENET_EVENTS_URL: process.env.ODRA_CASPER_LIVENET_EVENTS_URL || process.env.CASPER_EVENT_STREAM_URL || "",
  };
}

function runPhase2LivenetCmd(args: string[]): Promise<{ stdout: string; stderr: string; deployHash: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(BIN, args, {
      cwd: `${ROOT}/contracts/wardens_phase2`,
      env: getLivenetEnv(),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Command failed (exit ${code}): ${stderr || stdout}`));
      const match = stdout.match(/(?:deploy|transaction)\s+"([a-fA-F0-9]{64})"/i) || stdout.match(/transaction\s*([a-fA-F0-9]{64})/i) || stdout.match(/hash:\s*([a-fA-F0-9]{64})/i);
      // Reject if no real on-chain deploy hash found — never fabricate a fake hash.
      if (!match) {
        return reject(new Error(`No deploy hash in Phase2 CLI output. Raw output: ${(stdout + stderr).slice(-600)}`));
      }
      resolve({ stdout, stderr, deployHash: match[1] });
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
    // In chain mode this would submit to ChallengeCourt.cast_vote.
    // For Phase 2 demo the backend tracks votes and auto-resolves at threshold.
    const challenge = casper.challenges.get(Number(challenge_id));
    if (!challenge) return res.status(404).json({ error: "ChallengeNotFound" });
    if (challenge.status !== "Open" && challenge.status !== "InArbitration") {
      return res.status(400).json({ error: "ChallengeAlreadyResolved" });
    }

    if (process.env.WARDENS_MODE === "chain") {
      const hash = process.env.WARDENS_CHALLENGE_COURT_HASH;
      if (!hash) return res.status(500).json({ error: "WARDENS_CHALLENGE_COURT_HASH not configured" });
      const { stdout, deployHash } = await runPhase2LivenetCmd([
        "call", "ChallengeCourt", hash, "cast_vote", String(challenge_id), arbitrator_id, String(vote_upheld)
      ]);
      const match = stdout.match(/RESOLVED=(true|false)/i);
      const resolved = match ? match[1].toLowerCase() === "true" : false;
      return res.json({ vote_cast: true, resolved, deploy_hash: deployHash, on_chain: true });
    }

    // Update vote counts in memory (on-chain: ChallengeCourt.cast_vote deploy).
    const voteKey = `votes:${challenge_id}`;
    const votes: { upheld: string[]; rejected: string[] } =
      (casper as any)._votes?.get(voteKey) ?? { upheld: [], rejected: [] };
    if (votes.upheld.includes(arbitrator_id) || votes.rejected.includes(arbitrator_id)) {
      return res.status(400).json({ error: "AlreadyVoted" });
    }
    if (vote_upheld) {
      votes.upheld.push(arbitrator_id);
    } else {
      votes.rejected.push(arbitrator_id);
    }
    if (!(casper as any)._votes) (casper as any)._votes = new Map();
    (casper as any)._votes.set(voteKey, votes);

    // Auto-resolve at MIN_ARBITRATION_VOTES = 2.
    const MIN_VOTES = 2;
    let resolved = false;
    let finalUpheld = false;

    if (votes.upheld.length >= MIN_VOTES) {
      const tx = await casper.resolveChallenge(Number(challenge_id), true);
      resolved = true; finalUpheld = true;
      return res.json({ vote_cast: true, resolved, upheld: true, deploy_hash: tx.deploy_hash });
    }
    if (votes.rejected.length >= MIN_VOTES) {
      const tx = await casper.resolveChallenge(Number(challenge_id), false);
      resolved = true; finalUpheld = false;
      return res.json({ vote_cast: true, resolved, upheld: false, deploy_hash: tx.deploy_hash });
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

phase2Router.post("/reserve/tranche", async (req, res) => {
  try {
    const { asset_id, amount } = req.body ?? {};
    if (!asset_id) return res.status(400).json({ error: "asset_id required" });
    
    if (process.env.WARDENS_MODE === "chain") {
      const hash = process.env.WARDENS_RESERVE_VAULT_HASH;
      if (!hash) return res.status(500).json({ error: "WARDENS_RESERVE_VAULT_HASH not configured" });
      const { stdout } = await runPhase2LivenetCmd(["call", "ReserveVault", hash, "create_tranche", asset_id, String(amount || 0)]);
      const match = stdout.match(/TRANCHE_ID=(\d+)/);
      // Reject if the on-chain contract did not return a tranche ID — never fabricate one.
      if (!match) {
        return res.status(502).json({ error: "No TRANCHE_ID in contract output — on-chain call may have failed", raw: stdout.slice(-400) });
      }
      const tranche_id = Number(match[1]);
      res.json({ tranche_id, asset_id, amount, on_chain: true });
    } else {
      const tid = ++trancheSeq;
      tranches.set(tid, { asset_id, amount: Number(amount ?? 0), released: false, blocked: false });
      res.json({ tranche_id: tid, asset_id, amount, on_chain: false });
    }
  } catch(e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

phase2Router.post("/reserve/release", async (req, res) => {
  try {
    const { tranche_id } = req.body ?? {};
    if (process.env.WARDENS_MODE === "chain") {
      const hash = process.env.WARDENS_RESERVE_VAULT_HASH;
      if (!hash) return res.status(500).json({ error: "WARDENS_RESERVE_VAULT_HASH not configured" });
      await runPhase2LivenetCmd(["call", "ReserveVault", hash, "release_tranche", String(tranche_id), "true"]);
      res.json({ ok: true, tranche_id, on_chain: true, message: "Tranche released via on-chain call" });
    } else {
      const tr = tranches.get(Number(tranche_id));
      if (!tr) return res.status(404).json({ error: "TrancheNotFound" });
      if (tr.released) return res.status(400).json({ error: "TrancheAlreadyReleased" });

      const asset = casper.assets.get(tr.asset_id);
      const score = asset?.current_score ?? 0;
      if (score < 85) {
        tr.blocked = true;
        tranches.set(Number(tranche_id), tr);
        return res.status(403).json({ error: "DrawsFrozen", reason: `Covenant requires score≥85 for tranche release. Current: ${score}` });
      }
      tr.released = true;
      tranches.set(Number(tranche_id), tr);
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

const commitments = new Map<number, { asset_id: string; committer: string; merkle_root: string; revealed: boolean; reveal_hash: string }>();
let commitSeq = 0;

phase2Router.post("/privacy/commit", async (req, res) => {
  try {
    const { asset_id, committer, merkle_root } = req.body ?? {};
    if (!asset_id || !merkle_root) return res.status(400).json({ error: "asset_id and merkle_root required" });
    
    if (process.env.WARDENS_MODE === "chain") {
      const hash = process.env.WARDENS_PRIVACY_STORE_HASH;
      if (!hash) return res.status(500).json({ error: "WARDENS_PRIVACY_STORE_HASH not configured" });
      const { stdout } = await runPhase2LivenetCmd(["call", "PrivacyCommitmentStore", hash, "store_commitment", asset_id, committer ?? "anonymous", merkle_root]);
      const match = stdout.match(/COMMITMENT_ID=(\d+)/);
      // Reject if the on-chain contract did not return a commitment ID — never fabricate one.
      if (!match) {
        return res.status(502).json({ error: "No COMMITMENT_ID in contract output — on-chain call may have failed", raw: stdout.slice(-400) });
      }
      const commitment_id = Number(match[1]);
      res.json({ commitment_id, asset_id, merkle_root, on_chain: true, message: "Commitment stored on-chain (Merkle root only)" });
    } else {
      const cid = ++commitSeq;
      commitments.set(cid, {
        asset_id,
        committer: committer ?? "anonymous",
        merkle_root,
        revealed: false,
        reveal_hash: "",
      });
      res.json({ commitment_id: cid, asset_id, merkle_root, on_chain: false, message: "Commitment stored locally (Merkle root only)" });
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

    const body = { asset_id, trust_score: score, covenant_state, issuer: issuer ?? asset.issuer };

    // Call insurance agent through x402.
    const result = await x402Post<any>(`${INSURANCE_AGENT_URL}/verify/insurance`, body);

    addReceipt({
      asset_id,
      verifier_agent: "insurance-agent-1",
      receipt: result.receipt,
      amount: result.amount,
      paid: result.paid,
      status402Seen: result.status402Seen,
      timestamp: Date.now(),
    });

    res.json({
      asset_id,
      insurance_score: result.data.score,
      valid: result.data.valid,
      findings: result.data.findings,
      x402_receipt: result.receipt,
      covenant_state,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
