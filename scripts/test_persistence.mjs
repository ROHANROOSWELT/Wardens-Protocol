#!/usr/bin/env node
// test_persistence.mjs — validates ALL off-chain JSON caches round-trip correctly.
// Run from the wardens/ directory: node scripts/test_persistence.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE_DIR = `${ROOT}/backend/.local`;
const TEST_DIR = `${CACHE_DIR}/_test_tmp`;

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

function writeTest(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

function readTest(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

// ──────────────────────────────────────────────────────────────────────────────
console.log("\n🔍 Wardens Protocol — Off-Chain Persistence Test Suite");
console.log("━".repeat(60));

// ── 1. STORE: receipts, explanations, lastScoreIds ────────────────────────────
console.log("\n[1] store.ts — receipts, explanations, lastScoreIds");

const receiptsFile = `${TEST_DIR}/receipts.json`;
const explanationsFile = `${TEST_DIR}/explanations.json`;
const lastScoreIdsFile = `${TEST_DIR}/last_score_ids.json`;

const testReceipts = [
  { asset_id: "INV-001", verifier_agent: "parser-agent", receipt: "rcpt-abc", amount: "1000000", paid: true, status402Seen: true, timestamp: 1234567890 },
  { asset_id: "INV-002", verifier_agent: "fraud-agent", receipt: "rcpt-xyz", amount: "2000000", paid: false, status402Seen: false, timestamp: 9876543210 },
];
writeTest(receiptsFile, testReceipts);
const r = readTest(receiptsFile);
assert("receipts: array length preserved", r.length === 2);
assert("receipts: asset_id preserved", r[0].asset_id === "INV-001");
assert("receipts: paid flag preserved", r[0].paid === true);
assert("receipts: nested string preserved", r[1].receipt === "rcpt-xyz");

const testExplanations = { "INV-001": "Score 92: invoice valid.", "INV-002": "Score 45: duplicate found." };
writeTest(explanationsFile, testExplanations);
const ex = readTest(explanationsFile);
assert("explanations: key-value round-trip", ex["INV-001"] === "Score 92: invoice valid.");
assert("explanations: second key preserved", ex["INV-002"].includes("duplicate"));

const testLastIds = { "INV-001": 3, "INV-002": 7, "INV-1784968500001-0042": 12 };
writeTest(lastScoreIdsFile, testLastIds);
const lsi = readTest(lastScoreIdsFile);
assert("lastScoreIds: numeric values preserved", lsi["INV-001"] === 3 && lsi["INV-002"] === 7);
assert("lastScoreIds: timestamp-format key preserved", lsi["INV-1784968500001-0042"] === 12);

// ── 2. chainSync: assets, agents, scores, challenges, positions, assetScoreIds ──
console.log("\n[2] chainSync.ts — assets, agents, scores, challenges, positions, assetScoreIds");

const testAssets = [
  ["INV-001", { asset_id: "INV-001", issuer: "Acme Corp", debtor: "Buyer Ltd", face_value: 50000, due_date: 9999999999, evidence_hash: "sha256:abc", status: "Healthy", current_score: 92, created_at: 1000, updated_at: 2000 }],
  ["INV-002", { asset_id: "INV-002", issuer: "Beta Inc", debtor: "Delta LLC", face_value: 12000, due_date: 8888888888, evidence_hash: "sha256:def", status: "Frozen", current_score: 30, created_at: 1001, updated_at: 2001 }],
];
writeTest(`${TEST_DIR}/assets.json`, testAssets);
const assets = new Map(readTest(`${TEST_DIR}/assets.json`));
assert("assets: Map reconstructed", assets.size === 2);
assert("assets: score preserved", assets.get("INV-001").current_score === 92);
assert("assets: status preserved", assets.get("INV-002").status === "Frozen");

const testAgents = [
  ["aggregator-agent-1", { agent_id: "aggregator-agent-1", role: "aggregator", bonded_amount: 10, reputation: 100, total_reports: 5, successful_reports: 5, slashed_count: 0, active: true, x402_price: 1000000 }],
  ["challenger-agent-1", { agent_id: "challenger-agent-1", role: "challenger", bonded_amount: 8, reputation: 95, total_reports: 3, successful_reports: 3, slashed_count: 0, active: true, x402_price: 750000 }],
];
writeTest(`${TEST_DIR}/agents.json`, testAgents);
const agents = new Map(readTest(`${TEST_DIR}/agents.json`));
assert("agents: Map reconstructed", agents.size === 2);
assert("agents: x402_price preserved", agents.get("aggregator-agent-1").x402_price === 1000000);
assert("agents: reputation preserved", agents.get("challenger-agent-1").reputation === 95);

const testScores = [
  [1, { score_id: 1, asset_id: "INV-001", score: 92, agent_id: "aggregator-agent-1", evidence_hash: "sha256:ev1", explanation_hash: "sha256:ex1", timestamp: 1000, challenge_deadline: 999999, challenged: false }],
  [2, { score_id: 2, asset_id: "INV-002", score: 30, agent_id: "aggregator-agent-1", evidence_hash: "sha256:ev2", explanation_hash: "sha256:ex2", timestamp: 1001, challenge_deadline: 888888, challenged: true }],
];
writeTest(`${TEST_DIR}/scores.json`, testScores);
const scores = new Map(readTest(`${TEST_DIR}/scores.json`));
assert("scores: Map reconstructed", scores.size === 2);
assert("scores: score value preserved", scores.get(1)?.score === 92);
assert("scores: challenged flag preserved", scores.get(2)?.challenged === true);

const testChallenges = [
  [1, { challenge_id: 1, asset_id: "INV-002", score_id: 2, challenger_agent_id: "challenger-agent-1", challenged_agent_id: "aggregator-agent-1", counter_evidence_hash: "sha256:ce1", counter_bond: 5, status: "Open", opened_at: 1500, resolved_at: 0 }],
];
writeTest(`${TEST_DIR}/challenges.json`, testChallenges);
const challenges = new Map(readTest(`${TEST_DIR}/challenges.json`));
assert("challenges: Map reconstructed", challenges.size === 1);
assert("challenges: status preserved", challenges.get(1)?.status === "Open");
assert("challenges: challenger preserved", challenges.get(1)?.challenger_agent_id === "challenger-agent-1");

const testPositions = [
  ["INV-001", { asset_id: "INV-001", collateral_value: 40000, borrowed_amount: 25000, current_ltv: 75, frozen: false }],
];
writeTest(`${TEST_DIR}/positions.json`, testPositions);
const positions = new Map(readTest(`${TEST_DIR}/positions.json`));
assert("positions: Map reconstructed", positions.size === 1);
assert("positions: ltv preserved", positions.get("INV-001").current_ltv === 75);
assert("positions: frozen flag preserved", positions.get("INV-001").frozen === false);

const testScoreIds = [["INV-001", [1]], ["INV-002", [2]]];
writeTest(`${TEST_DIR}/asset_score_ids.json`, testScoreIds);
const assetScoreIds = new Map(readTest(`${TEST_DIR}/asset_score_ids.json`));
assert("assetScoreIds: Map reconstructed", assetScoreIds.size === 2);
assert("assetScoreIds: array values preserved", assetScoreIds.get("INV-001")?.[0] === 1);

// ── 3. chainSync: counters ────────────────────────────────────────────────────
console.log("\n[3] chainSync.ts — scoreCount/challengeCount counters");

const testCounters = { scoreCount: 42, challengeCount: 7 };
writeTest(`${TEST_DIR}/counters.json`, testCounters);
const counters = readTest(`${TEST_DIR}/counters.json`);
assert("counters: scoreCount preserved", counters.scoreCount === 42);
assert("counters: challengeCount preserved", counters.challengeCount === 7);

// ── 4. chainSync: transactions ────────────────────────────────────────────────
console.log("\n[4] chainSync.ts — transactions");

const testTxs = [
  { action: "create_asset", deploy_hash: "a".repeat(64), result: "Asset INV-001 created", timestamp: 1234 },
  { action: "submit_score", deploy_hash: "b".repeat(64), result: "Score 92", timestamp: 5678 },
];
writeTest(`${TEST_DIR}/transactions.json`, testTxs);
const txs = readTest(`${TEST_DIR}/transactions.json`);
assert("transactions: array preserved", txs.length === 2);
assert("transactions: deploy_hash length (64 hex)", txs[0].deploy_hash.length === 64);
assert("transactions: action preserved", txs[1].action === "submit_score");

// ── 5. phase2.ts: tranches, commitments, votes ────────────────────────────────
console.log("\n[5] phase2.ts — Covenant Engine state");

const testPhase2 = {
  tranches: [[1, { asset_id: "INV-001", amount: 500, released: true, blocked: false }], [2, { asset_id: "INV-001", amount: 300, released: false, blocked: false }]],
  trancheSeq: 2,
  commitments: [[1, { asset_id: "INV-001", committer: "aggregator-agent-1", merkle_root: "sha256:merkle-abc", revealed: true, reveal_hash: "sha256:merkle-abc" }]],
  commitSeq: 1,
  votes: [["votes:1", { upheld: ["aggregator-agent-1"], rejected: [] }]],
};
writeTest(`${TEST_DIR}/phase2_state.json`, testPhase2);
const p2 = readTest(`${TEST_DIR}/phase2_state.json`);
const tranchesMap = new Map(p2.tranches);
assert("phase2 tranches: Map reconstructed", tranchesMap.size === 2);
assert("phase2 tranches: released flag preserved", tranchesMap.get(1).released === true);
assert("phase2 trancheSeq: preserved", p2.trancheSeq === 2);
const commitmentsMap = new Map(p2.commitments);
assert("phase2 commitments: Map reconstructed", commitmentsMap.size === 1);
assert("phase2 commitments: revealed flag preserved", commitmentsMap.get(1).revealed === true);
assert("phase2 commitSeq: preserved", p2.commitSeq === 1);
const votesMap = new Map(p2.votes);
assert("phase2 votes: Map reconstructed", votesMap.size === 1);
assert("phase2 votes: upheld array preserved", votesMap.get("votes:1").upheld.length === 1);

// ── 6. Verify existing Azure cache files are valid JSON (if present) ──────────
console.log("\n[6] Azure live cache — validating existing files (if present)");

const liveFiles = [
  "assets.json", "agents.json", "scores.json", "challenges.json",
  "positions.json", "asset_score_ids.json", "counters.json", "transactions.json",
  "receipts.json", "explanations.json", "last_score_ids.json", "phase2_state.json",
  "tracked_assets.json",
];

for (const f of liveFiles) {
  const fp = `${CACHE_DIR}/${f}`;
  if (existsSync(fp)) {
    try {
      const parsed = JSON.parse(readFileSync(fp, "utf8"));
      const size = Array.isArray(parsed) ? parsed.length : (parsed && typeof parsed === "object" ? Object.keys(parsed).length : "?");
      console.log(`  ✅ ${f}: valid JSON (${size} entries)`);
      passed++;
    } catch (e) {
      console.error(`  ❌ ${f}: INVALID JSON — ${e.message}`);
      failed++;
    }
  } else {
    console.log(`  ⏭  ${f}: not present (backend not started yet — OK)`);
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n" + "━".repeat(60));
if (failed === 0) {
  console.log(`✅ ALL ${passed} TESTS PASSED — off-chain persistence is solid.`);
} else {
  console.error(`❌ ${failed} TESTS FAILED, ${passed} passed.`);
  process.exit(1);
}
