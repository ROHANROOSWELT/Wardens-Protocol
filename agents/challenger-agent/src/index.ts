// Challenger Agent (Section 7.5). Watches the latest posted score for an asset,
// independently rechecks it against the on-chain assets (duplicates) and deterministic rules,
// and opens a challenge if a high score looks wrong.
//
// Run: `bun run src/index.ts <asset_id>`  (opens a challenge if suspicious)

import { explain } from "../../../backend/src/services/llmClient.ts";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";
const AGENT_ID = process.env.AGENT_ID ?? "challenger-agent-1";
const SUSPICIOUS_ABOVE = 70; // "high score" threshold for triggering a recheck

const assetId = process.argv[2] ?? "INV-003-LYING-SCORE";

async function runChallenger() {
  try {
    // 1. Fetch all assets from backend to do an independent recheck.
    const assetsRes = await fetch(`${BACKEND}/api/assets`);
    if (!assetsRes.ok) {
      console.error(`[challenger-agent] Failed to fetch on-chain assets.`);
      process.exit(0); // not an error — backend may not be ready yet
    }
    const assets = await assetsRes.json();
    const targetAsset = assets.find((a: any) => a.asset_id === assetId);

    if (!targetAsset) {
      console.log(`[challenger-agent] Asset ${assetId} not found yet — nothing to challenge.`);
      process.exit(0); // normal: asset hasn't been created yet
    }

    const reasons: string[] = [];

    // Check for duplicates
    const duplicates = assets.filter((a: any) => 
      a.asset_id !== targetAsset.asset_id &&
      a.issuer === targetAsset.issuer &&
      a.debtor === targetAsset.debtor &&
      a.face_value === targetAsset.face_value
    );

    if (duplicates.length > 0) reasons.push("duplicate invoice collateral on-chain");

    // Check registry heuristics
    const nIssuer = targetAsset.issuer?.toLowerCase() || "";
    const nDebtor = targetAsset.debtor?.toLowerCase() || "";
    if (nIssuer.includes("fake") || nDebtor.includes("fake") || nIssuer.includes("unknown") || nDebtor.includes("unknown")) {
      reasons.push("debtor/issuer missing/invalid in registry heuristics");
    }

    // Check if score is posted
    const scoreRes = await fetch(`${BACKEND}/api/challenge/latest-score/${assetId}`);
    if (!scoreRes.ok) {
      console.log(`[challenger-agent] No posted score for ${assetId} yet — nothing to challenge.`);
      process.exit(0); // normal: score hasn't been submitted yet
    }
    const { score_id } = await scoreRes.json();
    const dash = await (await fetch(`${BACKEND}/api/dashboard/${assetId}`)).json();
    const postedScore = dash.current_score as number;

    if (postedScore >= SUSPICIOUS_ABOVE && reasons.length > 0) {
      const factual = `Verifier posted score ${postedScore} but ${reasons.join(", ")}`;
      const reason = await explain(
        `A verifier scored collateral ${assetId} at ${postedScore}/100, but an independent recheck found: ${reasons.join(", ")}. ` +
          `Write a 1-2 sentence dispute rationale for opening an on-chain challenge.`,
        factual
      );
      const open = await fetch(`${BACKEND}/api/challenge/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score_id, challenger_agent_id: AGENT_ID, reason }),
      });
      const out = await open.json();
      console.log(
        JSON.stringify(
          {
            challenge_opened: open.ok,
            score_id,
            reason,
            counter_evidence_hash: out.counter_evidence_hash,
            tx_hash: out.deploy_hash,
          },
          null,
          2
        )
      );
    } else {
      console.log(`[challenger-agent] score ${postedScore} for ${assetId} looks fine — no challenge`);
    }
  } catch (e) {
    console.error(`[challenger-agent] Error:`, e);
  }
}

runChallenger();
