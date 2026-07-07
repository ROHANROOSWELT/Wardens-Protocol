// Deterministic scoring (Section 7.4) — NEVER an LLM (Section 0 rule 2).
// The aggregator combines verifier scores with a fixed weighting; the LLM (if
// configured) only writes a human-readable explanation string afterwards.

export interface VerifierResult {
  agent: string;
  valid: boolean;
  score: number;
  findings: string[];
  evidence_hash: string;
  explanation?: string; // LLM-phrased (fallback: findings) — never affects scoring
}

// final_score = parser*0.25 + fraud*0.50 + registry*0.25
// Fraud gets the highest weight: a duplicate / already-paid / double-pledged
// invoice is the single highest-risk failure mode this system exists to catch.
export const WEIGHTS = { parser: 0.25, fraud: 0.5, registry: 0.25 } as const;

export function aggregateScore(parts: {
  parser: number;
  fraud: number;
  registry: number;
}): number {
  const raw =
    parts.parser * WEIGHTS.parser +
    parts.fraud * WEIGHTS.fraud +
    parts.registry * WEIGHTS.registry;
  return Math.round(raw);
}

// LTV table (Section 6.3) — authoritative, mirrors the on-chain vault.rs.
export function ltvForScore(score: number): number {
  if (score >= 90) return 75;
  if (score >= 75) return 60;
  if (score >= 60) return 40;
  if (score >= 50) return 20;
  return 0;
}

export type AssetStatus =
  | "Active"
  | "Healthy"
  | "Watchlist"
  | "Frozen"
  | "Defaulted";

export function statusForScore(score: number): AssetStatus {
  if (score >= 90) return "Healthy";
  if (score >= 70) return "Active";
  if (score >= 50) return "Watchlist";
  return "Frozen";
}
