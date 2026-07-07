// Shared evidence-hash helper (Section 6.7).
// Every evidence_hash / explanation_hash MUST be produced by this function so
// logically identical evidence always yields the same hash: keys sorted,
// whitespace removed, SHA-256 over the canonical JSON.
//
// This exact algorithm is mirrored in each agent's src/hash.ts.
import { createHash } from "node:crypto";

/** Recursively sort object keys to canonicalize the JSON representation. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** SHA-256 over canonical JSON (sorted keys, no insignificant whitespace). */
export function canonicalizeAndHash(obj: unknown): string {
  const canonicalJson = JSON.stringify(canonicalize(obj));
  return "sha256:" + createHash("sha256").update(canonicalJson).digest("hex");
}
