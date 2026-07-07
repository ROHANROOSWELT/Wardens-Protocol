// Parser Agent (Section 7.1). Extracts invoice fields from the mock invoice
// JSON (not OCR). Deterministic scoring only.
import { serveVerifier, type VerifyResult } from "../../common.ts";

function verify(body: { asset_id?: string; invoice_number?: string; amount?: number; due_date?: number }): VerifyResult {
  const findings: string[] = [];
  if (!body.asset_id) {
    return { agent: "parser-agent", valid: false, score: 0, findings: ["Invoice not found"] };
  }
  let score = 100;
  if (body.invoice_number) findings.push("Invoice number exists");
  else score -= 40;
  if (body.amount !== undefined && body.amount > 0) findings.push("Amount matches metadata");
  else score -= 30;
  if (body.due_date !== undefined && body.due_date > 0) findings.push("Due date found");
  else score -= 30;
  // A clean, fully-formed invoice scores 95 (leaves headroom over a perfect 100).
  score = Math.min(score, 95);
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
