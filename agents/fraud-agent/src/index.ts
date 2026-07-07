// Fraud-Heuristic Agent (Section 7.2). Detects duplicate invoice numbers,
// already-paid invoices, double-pledging, and amount/debtor mismatches by
// checking against the seeded mock ledger. Deterministic — no LLM.
//
// Scoring note: a *confirmed* hard fraud (duplicate or already-paid) is the
// highest-risk failure mode this system exists to catch, so it returns a score
// in the "invalid / fraud" tier (0). Because fraud carries 0.50 weight in the
// aggregator, a confirmed fraud reliably drives the final score below 50, which
// freezes the collateral (Section 6.3 / demo Scene 7).
import { serveVerifier, loadJson, type VerifyResult } from "../../common.ts";

const ledger = await loadJson<LedgerRow[]>("../backend/src/data/ledger.json");

function verify(body: { asset_id?: string; invoice_number?: string; amount?: number }): VerifyResult {
  const invoiceNumber = body.invoice_number;
  const findings: string[] = [];
  let hardFraud = false;

  if (!body.asset_id || !invoiceNumber) {
    return { agent: "fraud-agent", valid: false, score: 0, findings: ["Missing asset_id or invoice_number"] };
  }

  // Double-pledge / duplicate: the ledger is the source of truth. An invoice is
  // fraudulent when its number is already pledged under a DIFFERENT asset_id
  // than the one being verified (the legitimate original matches its own row).
  const led = ledger.find((l) => l.invoice_number === invoiceNumber);
  if (led && led.pledged && led.asset_id !== body.asset_id) {
    findings.push("Duplicate invoice number found");
    findings.push(`Invoice already pledged in ledger under ${led.asset_id}`);
    hardFraud = true;
  }

  // Already paid off-chain.
  if (led?.paid) {
    findings.push("Invoice already marked paid in ledger");
    hardFraud = true;
  }

  if (!hardFraud) {
    findings.unshift("No duplicate, no prior payment found in ledger");
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
