// Small in-memory read-model the dashboard reads from: x402 receipts and the
// latest human-readable explanation per asset. The chain (or sim) holds the
// authoritative state; this only holds off-chain demo metadata.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface X402Receipt {
  asset_id: string;
  verifier_agent: string;
  receipt: string;
  amount: string;
  paid: boolean;
  status402Seen: boolean;
  timestamp: number;
}

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const CACHE_DIR = `${ROOT}/backend/.local`;
const RECEIPTS_FILE = `${CACHE_DIR}/receipts.json`;
const EXPLANATIONS_FILE = `${CACHE_DIR}/explanations.json`;

const receipts: X402Receipt[] = [];
const explanations = new Map<string, string>();
const lastScoreIdByAsset = new Map<string, number>();

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function loadStore() {
  if (existsSync(RECEIPTS_FILE)) {
    try {
      const data = JSON.parse(readFileSync(RECEIPTS_FILE, "utf8"));
      receipts.push(...data);
    } catch {}
  }
  if (existsSync(EXPLANATIONS_FILE)) {
    try {
      const data = JSON.parse(readFileSync(EXPLANATIONS_FILE, "utf8"));
      for (const [k, v] of Object.entries(data)) {
        explanations.set(k, v as string);
      }
    } catch {}
  }
}

// Load from disk immediately on import
loadStore();

function saveReceipts() {
  ensureCacheDir();
  writeFileSync(RECEIPTS_FILE, JSON.stringify(receipts));
}

function saveExplanations() {
  ensureCacheDir();
  const obj = Object.fromEntries(explanations);
  writeFileSync(EXPLANATIONS_FILE, JSON.stringify(obj));
}

export function addReceipt(r: X402Receipt): void {
  receipts.push(r);
  saveReceipts();
}
export function receiptsForAsset(asset_id: string): X402Receipt[] {
  return receipts.filter((r) => r.asset_id === asset_id);
}
export function setExplanation(asset_id: string, text: string): void {
  explanations.set(asset_id, text);
  saveExplanations();
}
export function getExplanation(asset_id: string): string {
  return explanations.get(asset_id) ?? "";
}
export function setLastScoreId(asset_id: string, id: number): void {
  lastScoreIdByAsset.set(asset_id, id);
}
export function getLastScoreId(asset_id: string): number | undefined {
  return lastScoreIdByAsset.get(asset_id);
}
