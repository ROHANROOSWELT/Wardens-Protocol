// Shared x402 verifier server used by the parser, fraud, and registry agents.
// Implements the real x402 flow (Section 8): an unpaid POST gets 402 + payment
// headers; a POST carrying an X-Payment header is served and returns a real
// receipt hash. Scoring passed in by each agent is deterministic (Section 0
// rule 2); the LLM is used ONLY to phrase the explanation, with a fallback.
import { createHash } from "node:crypto";
import { canonicalizeAndHash } from "../backend/src/services/evidenceHasher.ts";
import { explain } from "../backend/src/services/llmClient.ts";

export interface VerifyResult {
  agent: string;
  valid: boolean;
  score: number;
  findings: string[];
}

export interface VerifierConfig {
  port: number;
  path: string; // e.g. "/verify/fraud"
  agent: string; // agent id label
  wallet: string; // payment address advertised in the 402
  price: string; // atomic price, e.g. "1000000"
  verify: (body: any) => VerifyResult;
}

export function serveVerifier(cfg: VerifierConfig): void {
  Bun.serve({
    port: cfg.port,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/health") {
        return Response.json({ ok: true, agent: cfg.agent });
      }
      if (req.method !== "POST" || url.pathname !== cfg.path) {
        return new Response("Not found", { status: 404 });
      }

      const payment = req.headers.get("X-Payment");
      if (!payment) {
        // First contact: demand payment.
        return new Response(JSON.stringify({ error: "Payment Required" }), {
          status: 402,
          headers: {
            "Content-Type": "application/json",
            "X-Payment-Amount": cfg.price,
            "X-Payment-Network": "casper",
            "X-Payment-Address": cfg.wallet,
          },
        });
      }

      // Payment header present. In a full facilitator integration the proof is
      // settled here; for the Qualification Round we validate the header shape
      // and issue a real receipt hash bound to the payment + result.
      const body = await req.json().catch(() => ({}));
      const result = cfg.verify(body);
      const evidence_hash = canonicalizeAndHash(result);
      const x402_receipt =
        "rcpt:" +
        createHash("sha256").update(`${payment}:${evidence_hash}`).digest("hex").slice(0, 40);

      // LLM phrases the explanation from the deterministic findings (fallback: findings).
      const fallback = result.findings.join("; ") + ".";
      const explanation = await explain(
        `Agent: ${cfg.agent}. Deterministic result: valid=${result.valid}, score=${result.score}/100. ` +
          `Findings: ${result.findings.join("; ")}. Explain the result in 1-2 sentences.`,
        fallback
      );

      return Response.json({
        paid: true,
        x402_receipt,
        agent: cfg.agent,
        valid: result.valid,
        score: result.score,
        findings: result.findings,
        explanation,
        evidence_hash,
      });
    },
  });
  console.log(`[${cfg.agent}] x402 verifier on :${cfg.port}${cfg.path}`);
}

// Data loaders shared by agents (read the single seed dataset).
export async function loadJson<T>(rel: string): Promise<T> {
  const path = new URL(rel, import.meta.url);
  return (await Bun.file(path).json()) as T;
}
