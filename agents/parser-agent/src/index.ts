// Parser Agent (Section 7.1). Extracts invoice fields from the actual invoice
// JSON uploaded to the backend off-chain store.
// Deterministic scoring only.

import { serveVerifier, type VerifyResult } from "../../common.ts";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";

async function verify(body: { asset_id?: string; amount?: number; due_date?: number }): Promise<VerifyResult> {
  const findings: string[] = [];
  if (!body.asset_id) {
    return { agent: "parser-agent", valid: false, score: 0, findings: ["Asset not found"] };
  }

  let score = 100;
  let parsedDoc: any = null;

  try {
    const res = await fetch(`${BACKEND}/api/assets/doc/${body.asset_id}`);
    if (res.ok) {
      const data = await res.json();
      if (data.invoice_number) {
        findings.push(`Invoice number exists: ${data.invoice_number}`);
      } else {
        score -= 40;
        findings.push("Missing invoice number");
      }
      
      // Parse the uploaded raw invoice document
      if (data.invoice_file_content && data.invoice_file_content !== "{}") {
        try {
          parsedDoc = JSON.parse(data.invoice_file_content);
          findings.push("Successfully parsed uploaded invoice JSON document");
          
          // Cross-check the parsed document's fields with the chain's face_value / due_date
          if (parsedDoc.amount !== undefined && parsedDoc.amount === body.amount) {
            findings.push("Document amount matches on-chain metadata");
          } else if (parsedDoc.amount !== undefined) {
            score -= 30;
            findings.push(`Mismatch: document amount ${parsedDoc.amount} != chain amount ${body.amount}`);
          }

          if (parsedDoc.due_date) {
            // Very simple cross-check heuristic
            findings.push("Document due date found");
          }
        } catch(e) {
          score -= 20;
          findings.push("Uploaded invoice document is invalid JSON");
        }
      } else {
         findings.push("No invoice document uploaded — relying on metadata only");
      }
    } else {
      score -= 50;
      findings.push("Failed to retrieve off-chain invoice metadata");
    }
  } catch (e) {
    score -= 50;
    findings.push("Error accessing off-chain document store");
  }

  if (body.amount !== undefined && body.amount > 0) findings.push("Chain metadata amount > 0");
  else score -= 15;
  
  if (body.due_date !== undefined && body.due_date > 0) findings.push("Chain metadata due date valid");
  else score -= 15;

  // A clean, fully-formed invoice scores 95 (leaves headroom over a perfect 100).
  score = Math.max(0, Math.min(score, 95));
  return { agent: "parser-agent", valid: score >= 50, score, findings };
}

serveVerifier({
  port: Number(process.env.PORT ?? 4101),
  path: "/verify/parse",
  agent: process.env.AGENT_ID ?? "parser-agent-1",
  wallet: process.env.AGENT_WALLET ?? "casper-parser-agent-wallet",
  price: process.env.VERIFICATION_PRICE ?? "1000000",
  verify,
});
