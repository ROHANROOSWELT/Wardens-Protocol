// Aggregator Agent (Section 7.4). Pays the parser, fraud, and registry agents
// through x402, collects their results, computes the final trust score
// deterministically, and posts it to Casper.
//
// The x402 payments + deterministic weighting + submit_score are performed by
// the backend orchestrator (Section 9, backend/src/routes/verify.ts, which uses
// x402Client + scoreEngine). This agent is the trigger/identity that drives
// that flow — run: `bun run src/index.ts <asset_id>`.
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";
const AGENT_ID = process.env.AGENT_ID ?? "aggregator-agent-1";

const assetId = process.argv[2] ?? "INV-001";

const res = await fetch(`${BACKEND}/api/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ asset_id: assetId, agent_id: AGENT_ID }),
});
const out = await res.json();
if (!res.ok) {
  console.error("[aggregator-agent] verification failed:", out);
  process.exit(1);
}
console.log(`[aggregator-agent] ${assetId} -> final_score=${out.final_score} tx=${out.tx_hash}`);
console.log(JSON.stringify(out, null, 2));
