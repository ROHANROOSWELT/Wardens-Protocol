// Fraud-Heuristic Agent (Section 7.2). Detects duplicates on-chain.
// Deterministic — no LLM.

import { serveVerifier, type VerifyResult } from "../../common.ts";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";

async function verify(body: { asset_id?: string; issuer?: string; debtor?: string; face_value?: number; due_date?: number }): Promise<VerifyResult> {
  const findings: string[] = [];
  let hardFraud = false;

  if (!body.asset_id) {
    return { agent: "fraud-agent", valid: false, score: 0, findings: ["Missing asset_id"] };
  }

  // Double-pledge / duplicate: Check if another asset on-chain has the exact same details
  // (which would mean same evidence_hash/invoice payload).
  try {
    const res = await fetch(`${BACKEND}/api/assets`);
    if (res.ok) {
      const allAssets = await res.json();
      const duplicate = allAssets.find((a: any) => 
        a.asset_id !== body.asset_id &&
        a.issuer === body.issuer &&
        a.debtor === body.debtor &&
        a.face_value === body.face_value &&
        a.due_date === body.due_date
      );

      if (duplicate) {
        findings.push("Duplicate invoice collateral found on-chain");
        findings.push(`Asset already pledged under ${duplicate.asset_id}`);
        hardFraud = true;
      }
    }
  } catch (e) {
    console.error("Failed to fetch assets for fraud check", e);
  }

  if (!hardFraud) {
    findings.unshift("No duplicate collateral found on-chain");
    return { agent: "fraud-agent", valid: true, score: 95, findings };
  }
  
  return { agent: "fraud-agent", valid: false, score: 0, findings };
}

serveVerifier({
  port: Number(process.env.PORT ?? 4102),
  path: "/verify/fraud",
  agent: process.env.AGENT_ID ?? "fraud-agent-1",
  wallet: process.env.AGENT_WALLET ?? "casper-fraud-agent-wallet",
  price: process.env.VERIFICATION_PRICE ?? "1000000",
  verify,
});
