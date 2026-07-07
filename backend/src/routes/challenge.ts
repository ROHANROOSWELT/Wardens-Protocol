import { Router } from "express";
import { casper } from "../services/casperClient.ts";
import { canonicalizeAndHash } from "../services/evidenceHasher.ts";
import { getLastScoreId } from "../services/store.ts";

export const challengeRouter = Router();

// POST /api/challenge/open { score_id, challenger_agent_id, reason, counter_bond? }
challengeRouter.post("/open", (req, res) => {
  try {
    const {
      score_id,
      challenger_agent_id = "challenger-agent-1",
      reason = "",
      counter_bond = 5,
    } = req.body ?? {};
    if (score_id === undefined) return res.status(400).json({ error: "score_id required" });
    const counter_evidence_hash = canonicalizeAndHash({ score_id, reason });
    const tx = casper.openChallenge({
      score_id: Number(score_id),
      challenger_agent_id,
      counter_evidence_hash,
      counter_bond: Number(counter_bond),
    });
    res.json({ deploy_hash: tx.deploy_hash, challenge_id: tx.challenge_id, reason, counter_evidence_hash });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /api/challenge/resolve { challenge_id, upheld }
challengeRouter.post("/resolve", (req, res) => {
  try {
    const { challenge_id, upheld } = req.body ?? {};
    if (challenge_id === undefined) return res.status(400).json({ error: "challenge_id required" });
    const tx = casper.resolveChallenge(Number(challenge_id), Boolean(upheld));
    res.json({ deploy_hash: tx.deploy_hash, challenge_id: Number(challenge_id), upheld: Boolean(upheld) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// Convenience: resolve by asset using its latest score (used by the challenger agent).
challengeRouter.get("/latest-score/:asset_id", (req, res) => {
  const id = getLastScoreId(req.params.asset_id);
  if (id === undefined) return res.status(404).json({ error: "no score yet" });
  res.json({ score_id: id });
});
