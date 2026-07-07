// Challenger Agent (Section 7.5). Watches the latest posted score for an asset,
// independently rechecks it against the seed ledger/registry, and opens a
// challenge if a high score looks wrong (duplicate, already-paid, missing
// debtor). Triggers are DETERMINISTIC; the LLM only phrases the dispute reason.
//
// Run: `bun run src/index.ts <asset_id>`  (opens a challenge if suspicious)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { explain } from "../../../backend/src/services/llmClient.ts";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";
const AGENT_ID = process.env.AGENT_ID ?? "challenger-agent-1";
const SUSPICIOUS_ABOVE = 70; // "high score" threshold for triggering a recheck

function dataPath(name: string): string {
  return fileURLToPath(new URL(`../../../backend/src/data/${name}`, import.meta.url));
}
const invoices = JSON.parse(readFileSync(dataPath("invoices.json"), "utf8"));
const ledger = JSON.parse(readFileSync(dataPath("ledger.json"), "utf8"));
const registry = JSON.parse(readFileSync(dataPath("registry.json"), "utf8"));

const assetId = process.argv[2] ?? "INV-003-LYING-SCORE";

const inv = invoices.find((i: any) => i.asset_id === assetId);
if (!inv) {
  console.error(`[challenger-agent] no seed invoice for ${assetId}`);
  process.exit(1);
}

// Independent recheck.
const reasons: string[] = [];
const led = ledger.find((l: any) => l.invoice_number === inv.invoice_number);
if (led?.paid) reasons.push("invoice already paid in ledger");
const dupes = invoices.filter((i: any) => i.invoice_number === inv.invoice_number);
if (dupes.length > 1) reasons.push("duplicate invoice number");
const debtor = registry.find((r: any) => r.company === inv.debtor);
if (!debtor?.valid) reasons.push("debtor missing/invalid in registry");

// Fetch the latest posted score.
const scoreRes = await fetch(`${BACKEND}/api/challenge/latest-score/${assetId}`);
if (!scoreRes.ok) {
  console.error(`[challenger-agent] no posted score for ${assetId} yet`);
  process.exit(1);
}
const { score_id } = await scoreRes.json();
const dash = await (await fetch(`${BACKEND}/api/dashboard/${assetId}`)).json();
const postedScore = dash.current_score as number;

if (postedScore >= SUSPICIOUS_ABOVE && reasons.length > 0) {
  // Deterministic trigger + reason; LLM only rephrases it (fallback = deterministic).
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
