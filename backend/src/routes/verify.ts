import { Router } from "express";
import { casper } from "../services/casperClient.ts";
import { x402Post } from "../services/x402Client.ts";
import { aggregateScore } from "../services/scoreEngine.ts";
import { canonicalizeAndHash } from "../services/evidenceHasher.ts";
import { addReceipt, setExplanation, setLastScoreId } from "../services/store.ts";
import { explain as llmExplain } from "../services/llmClient.ts";
import type { VerifierResult } from "../services/scoreEngine.ts";

export const verifyRouter = Router();

const PARSER = process.env.PARSER_AGENT_URL ?? "http://localhost:4101";
const FRAUD = process.env.FRAUD_AGENT_URL ?? "http://localhost:4102";
const REGISTRY = process.env.REGISTRY_AGENT_URL ?? "http://localhost:4103";


// Deterministic fallback explanation (Section 0 rule 2 / Step C): built from
// findings so the demo never depends on an LLM call succeeding.
function fallbackExplain(finalScore: number, results: VerifierResult[]): string {
  const bad = results.filter((r) => !r.valid).flatMap((r) => r.findings);
  if (bad.length > 0) return `Score ${finalScore}: ${bad.join("; ")}.`;
  return `Score ${finalScore}: invoice valid, no duplicate found, registry confirmed.`;
}

// Aggregator's LLM synthesis — narrates the already-computed score. The final
// number is deterministic; the LLM only writes prose (fallback on any failure).
async function aggregateExplanation(
  assetId: string,
  finalScore: number,
  results: VerifierResult[]
): Promise<string> {
  const fallback = fallbackExplain(finalScore, results);
  const detail = results
    .map((r) => `${r.agent} (score ${r.score}): ${r.explanation ?? r.findings.join("; ")}`)
    .join(" | ");
  return llmExplain(
    `Aggregated trust score for collateral ${assetId} is ${finalScore}/100 (already computed). ` +
      `Verifier outputs: ${detail}. Summarize why in 1-2 sentences for a lending dashboard.`,
    fallback
  );
}

// POST /api/verify/manual  { asset_id, score, agent_id? }
// Simulates an INDEPENDENT verifier posting a score directly (used for the
// lying-verifier demo on INV-003, Scene 8): a bonded verifier posts a high
// score that the challenger will later dispute. Scoring is still supplied by
// the caller, not an LLM.
verifyRouter.post("/manual", async (req, res) => {
  try {
    const { asset_id, score, agent_id = "aggregator-agent-1" } = req.body ?? {};
    if (asset_id === undefined || score === undefined)
      return res.status(400).json({ error: "asset_id and score required" });
    const evidence_hash = canonicalizeAndHash({ asset_id, score, manual: true });
    const explanation = `Verifier posted score ${score}.`;
    const explanation_hash = canonicalizeAndHash({ explanation });
    setExplanation(asset_id, explanation);
    const tx = await casper.submitScore({ asset_id, score: Number(score), agent_id, evidence_hash, explanation_hash });
    setLastScoreId(asset_id, tx.score_id);
    res.json({ asset_id, score: Number(score), score_id: tx.score_id, tx_hash: tx.deploy_hash });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /api/verify  { asset_id, agent_id? }
verifyRouter.post("/", async (req, res) => {
  const { asset_id, agent_id = "aggregator-agent-1" } = req.body ?? {};
  
  // Fetch asset from memory state instead of static seed file
  const assetData = casper.assets.get(asset_id);
  if (!assetData) return res.status(404).json({ error: "asset not found on chain" });

  try {
    // Three x402-paid verifier calls (Section 8).
    const parserCall = await x402Post<VerifierResult>(`${PARSER}/verify/parse`, {
      asset_id,
      invoice_number: asset_id,
      amount: assetData.face_value,
      due_date: assetData.due_date,
      invoice_file: `${asset_id}.json`,
    });
    const fraudCall = await x402Post<VerifierResult>(`${FRAUD}/verify/fraud`, {
      asset_id,
      invoice_number: asset_id,
      amount: assetData.face_value,
    });
    const registryCall = await x402Post<VerifierResult>(`${REGISTRY}/verify/registry`, {
      issuer: assetData.issuer,
      debtor: assetData.debtor,
    });

    const now = Date.now();
    for (const [call, name] of [
      [parserCall, "parser-agent"],
      [fraudCall, "fraud-agent"],
      [registryCall, "registry-agent"],
    ] as const) {
      addReceipt({
        asset_id,
        verifier_agent: name,
        receipt: call.receipt,
        amount: call.amount,
        paid: call.paid,
        status402Seen: call.status402Seen,
        timestamp: now,
      });
    }

    const results = [parserCall.data, fraudCall.data, registryCall.data];
    const final_score = aggregateScore({
      parser: parserCall.data.score,
      fraud: fraudCall.data.score,
      registry: registryCall.data.score,
    });
    // evidence_hash commits to the DETERMINISTIC verifier outputs only (exclude the
    // LLM explanation) so it's reproducible and a challenger can recompute it.
    const deterministic = results.map((r) => ({
      agent: r.agent,
      valid: r.valid,
      score: r.score,
      findings: r.findings,
      evidence_hash: r.evidence_hash,
    }));
    const evidence_hash = canonicalizeAndHash({ asset_id, results: deterministic });
    const explanation = await aggregateExplanation(asset_id, final_score, results);
    const explanation_hash = canonicalizeAndHash({ explanation });
    setExplanation(asset_id, explanation);

    const tx = await casper.submitScore({
      asset_id,
      score: final_score,
      agent_id,
      evidence_hash,
      explanation_hash,
    });
    setLastScoreId(asset_id, tx.score_id);

    res.json({
      asset_id,
      final_score,
      score_id: tx.score_id,
      explanation,
      evidence_hash,
      tx_hash: tx.deploy_hash,
      verifiers: {
        parser: { ...parserCall.data, x402_receipt: parserCall.receipt },
        fraud: { ...fraudCall.data, x402_receipt: fraudCall.receipt },
        registry: { ...registryCall.data, x402_receipt: registryCall.receipt },
      },
    });
  } catch (e) {
    res.status(502).json({
      error: `verification failed: ${(e as Error).message}. Are the agent services running (scripts/seed_demo.sh / run_verification.sh)?`,
    });
  }
});
