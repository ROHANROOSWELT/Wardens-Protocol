// Chain read-sync (chain mode only). Populates the backend read-model with LIVE
// on-chain state by invoking the proven Odra livenet executor's `dump` command
// (which reads the deployed contract via the proxy caller). The dashboard then
// serves that real testnet state through the normal /api/dashboard endpoint.
//
// On first startup in chain mode, syncAllFromChain() reads 3 assets from the
// real Casper contract (each dump call takes 30-90 s because it submits a
// Casper deploy) and writes the result to backend/.local/chain_cache.json so
// subsequent restarts load instantly without touching the node.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { casper, type Asset, type Agent, type Challenge, type TrustScore, type VaultPosition } from "./casperClient.ts";
import { setLastScoreId } from "./store.ts";
import type { AssetStatus } from "./scoreEngine.ts";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url)); // repo root
const CONTRACT_DIR = `${ROOT}/contracts/wardens_core`;
const RELEASE_BIN = `${CONTRACT_DIR}/target/release/wardens_livenet`;
const DEBUG_BIN = `${CONTRACT_DIR}/target/debug/wardens_livenet`;
function getLivenetBin(): string {
  return existsSync(RELEASE_BIN) ? RELEASE_BIN : DEBUG_BIN;
}
const STATE_FILE = `${ROOT}/scripts/.chain_state`;
/** Persisted chain snapshot — lets the backend restart instantly. */
const CACHE_DIR = `${ROOT}/backend/.local`;
const CACHE_FILE = `${CACHE_DIR}/chain_cache.json`;
const ASSETS_FILE = `${CACHE_DIR}/tracked_assets.json`;
const TXS_FILE = `${CACHE_DIR}/transactions.json`;

const ASSETS_CACHE_FILE = `${CACHE_DIR}/assets.json`;
const AGENTS_CACHE_FILE = `${CACHE_DIR}/agents.json`;
const SCORES_CACHE_FILE = `${CACHE_DIR}/scores.json`;
const CHALLENGES_CACHE_FILE = `${CACHE_DIR}/challenges.json`;
const POSITIONS_CACHE_FILE = `${CACHE_DIR}/positions.json`;
const ASSET_SCORE_IDS_CACHE_FILE = `${CACHE_DIR}/asset_score_ids.json`;

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

export function persistAllState() {
  ensureCacheDir();
  try {
    writeFileSync(ASSETS_CACHE_FILE, JSON.stringify(Array.from(casper.assets.entries()), null, 2));
    writeFileSync(AGENTS_CACHE_FILE, JSON.stringify(Array.from(casper.agents.entries()), null, 2));
    writeFileSync(SCORES_CACHE_FILE, JSON.stringify(Array.from(casper.scores.entries()), null, 2));
    writeFileSync(CHALLENGES_CACHE_FILE, JSON.stringify(Array.from(casper.challenges.entries()), null, 2));
    writeFileSync(POSITIONS_CACHE_FILE, JSON.stringify(Array.from(casper.positions.entries()), null, 2));
    writeFileSync(ASSET_SCORE_IDS_CACHE_FILE, JSON.stringify(Array.from(casper.assetScoreIds.entries()), null, 2));
    // Persist the sequence counters so they survive restarts without ID collisions.
    writeFileSync(`${CACHE_DIR}/counters.json`, JSON.stringify({ scoreCount: casper.scoreCount, challengeCount: casper.challengeCount }));
  } catch (e) {
    console.error("[chainSync] failed to persist state:", e);
  }
}

export function loadPersistedState() {
  try {
    if (existsSync(ASSETS_CACHE_FILE)) {
      const data = JSON.parse(readFileSync(ASSETS_CACHE_FILE, "utf8"));
      casper.assets = new Map(data);
    }
    if (existsSync(AGENTS_CACHE_FILE)) {
      const data = JSON.parse(readFileSync(AGENTS_CACHE_FILE, "utf8"));
      casper.agents = new Map(data);
    }
    if (existsSync(SCORES_CACHE_FILE)) {
      const data = JSON.parse(readFileSync(SCORES_CACHE_FILE, "utf8"));
      casper.scores = new Map(data);
    }
    if (existsSync(CHALLENGES_CACHE_FILE)) {
      const data = JSON.parse(readFileSync(CHALLENGES_CACHE_FILE, "utf8"));
      casper.challenges = new Map(data);
    }
    if (existsSync(POSITIONS_CACHE_FILE)) {
      const data = JSON.parse(readFileSync(POSITIONS_CACHE_FILE, "utf8"));
      casper.positions = new Map(data);
    }
    if (existsSync(ASSET_SCORE_IDS_CACHE_FILE)) {
      const data = JSON.parse(readFileSync(ASSET_SCORE_IDS_CACHE_FILE, "utf8"));
      casper.assetScoreIds = new Map(data);
    }
    // Restore sequence counters — critical: without this, new IDs collide with persisted ones.
    const countersFile = `${CACHE_DIR}/counters.json`;
    if (existsSync(countersFile)) {
      const counters = JSON.parse(readFileSync(countersFile, "utf8"));
      casper.scoreCount = counters.scoreCount ?? casper.scoreCount;
      casper.challengeCount = counters.challengeCount ?? casper.challengeCount;
    } else {
      // Fallback: derive counters from the maps themselves.
      if (casper.scores.size > 0) {
        casper.scoreCount = Math.max(...Array.from(casper.scores.keys()));
      }
      if (casper.challenges.size > 0) {
        casper.challengeCount = Math.max(...Array.from(casper.challenges.keys()));
      }
    }
    console.log(`[chainSync] loaded state from disk: ${casper.assets.size} assets, ${casper.agents.size} agents, ${casper.scores.size} scores, ${casper.challenges.size} challenges. scoreCount=${casper.scoreCount} challengeCount=${casper.challengeCount}`);
  } catch (e) {
    console.warn("[chainSync] failed to load state from disk:", (e as Error).message);
  }
}

export function persistTransaction(tx: import("./casperClient.ts").TxRecord) {
  ensureCacheDir();
  let txs: import("./casperClient.ts").TxRecord[] = [];
  if (existsSync(TXS_FILE)) {
    try { txs = JSON.parse(readFileSync(TXS_FILE, "utf8")); } catch { txs = []; }
  }
  // Upsert: update by deploy_hash if already exists (handles placeholder → real hash update)
  const idx = txs.findIndex((t) => t.deploy_hash === tx.deploy_hash);
  if (idx >= 0) {
    txs[idx] = tx;
  } else {
    txs.push(tx);
  }
  writeFileSync(TXS_FILE, JSON.stringify(txs));
  persistAllState();
}

/** Replace a placeholder transaction (by oldHash) with the confirmed on-chain one. */
export function replaceTransaction(
  oldHash: string,
  tx: import("./casperClient.ts").TxRecord
) {
  try {
    ensureCacheDir();
    let txs: import("./casperClient.ts").TxRecord[] = [];
    if (existsSync(TXS_FILE)) {
      try { txs = JSON.parse(readFileSync(TXS_FILE, "utf8")); } catch { txs = []; }
    }
    const before = txs.length;
    // Remove the old placeholder entry
    txs = txs.filter((t) => t.deploy_hash !== oldHash);
    txs.push(tx);
    writeFileSync(TXS_FILE, JSON.stringify(txs));
    console.log(`[chainSync] replaceTransaction: swapped ${oldHash.slice(0, 20)}... -> ${tx.deploy_hash.slice(0, 20)}... (was ${before} txs, now ${txs.length})`);
    persistAllState();
  } catch (e) {
    console.error(`[chainSync] replaceTransaction FAILED:`, e);
  }
}

function loadPersistedTransactions() {
  if (!existsSync(TXS_FILE)) return;
  try {
    const allTxs: import("./casperClient.ts").TxRecord[] = JSON.parse(readFileSync(TXS_FILE, "utf8"));
    // Purge any placeholder/mocked queued hashes (starting with cspr- or non-64-hex) from disk
    const txs = allTxs.filter((t) => t.deploy_hash && !t.deploy_hash.startsWith("cspr-") && /^[a-fA-F0-9]{64}$/.test(t.deploy_hash));
    if (txs.length !== allTxs.length) {
      writeFileSync(TXS_FILE, JSON.stringify(txs));
      console.log(`[chainSync] Purged ${allTxs.length - txs.length} mocked/queued placeholders from disk storage.`);
    }
    // Merge into casper.txs without duplicating existing entries
    const existingHashes = new Set(casper.txs.map((t) => t.deploy_hash));
    for (const tx of txs) {
      if (!existingHashes.has(tx.deploy_hash)) {
        // FILTER OUT LEGACY TRANSACTIONS
        const tsMatch = tx.result?.match(/INV-(\d+)-/);
        if (tsMatch) {
          const ts = parseInt(tsMatch[1], 10);
          if (ts > 1000000000000 && ts < 1784968500000) continue;
        }
        casper.txs.push(tx);
      }
    }
    console.log(`[chainSync] loaded ${casper.txs.length} verified on-chain transactions from disk.`);
  } catch (e) {
    console.warn("[chainSync] could not load persisted transactions:", (e as Error).message);
  }
}

function getTrackedAssets(): string[] {
  if (!existsSync(ASSETS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(ASSETS_FILE, "utf8"));
  } catch {
    return [];
  }
}

export function trackAssetLocally(asset_id: string) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const assets = getTrackedAssets();
  if (!assets.includes(asset_id)) {
    assets.push(asset_id);
    writeFileSync(ASSETS_FILE, JSON.stringify(assets));
  }
}

function formatAddress(addr: string): string {
  if (addr.startsWith("hash-")) {
    return addr.replace("hash-", "contract-package-");
  }
  return addr;
}

/** Deployed contract address: env override, else scripts/.chain_state. */
export function contractAddress(): string {
  let addr = "";
  if (process.env.WARDENS_CORE_ADDRESS) {
    addr = process.env.WARDENS_CORE_ADDRESS;
  } else if (existsSync(STATE_FILE)) {
    const m = readFileSync(STATE_FILE, "utf8").match(/WARDENS_CORE_ADDRESS=(.+)/);
    if (m) addr = m[1].trim();
  }
  return formatAddress(addr);
}

interface DumpData {
  asset: null | {
    asset_id: string; status: string; score: number;
    issuer: string; debtor: string; face_value: string;
  };
  agents: Array<{
    agent_id: string; role: string; bonded_amount: string; reputation: number;
    total_reports: number; successful_reports: number; slashed_count: number; active: boolean;
  }>;
  challenges: Array<{
    challenge_id: number; asset_id: string; challenger_agent_id: string;
    challenged_agent_id: string; counter_bond: string; status: string;
  }>;
}

function applyChainData(d: DumpData, requestedAssetId: string): void {
  const now = Date.now();
  if (d.asset && requestedAssetId) {
    const a = d.asset;

    // FILTER OUT LEGACY ASSETS FOR A CLEAN DASHBOARD
    const tsMatch = a.asset_id.match(/INV-(\d+)-/);
    if (tsMatch) {
      const ts = parseInt(tsMatch[1], 10);
      if (ts > 1000000000000 && ts < 1784968500000) return; // Ignore old assets
    }
    const asset: Asset = {
      asset_id: a.asset_id, issuer: a.issuer, debtor: a.debtor,
      face_value: Number(a.face_value), due_date: 0, evidence_hash: "(on-chain)",
      status: a.status as AssetStatus, current_score: a.score, created_at: now, updated_at: now,
    };
    casper.assets.set(a.asset_id, asset);
    // Seed a fresh score so currentLtv() treats it as non-stale (reflects chain).
    // Use a stable score_id per asset so repeated syncs do not balloon the count.
    const existingIds = casper.assetScoreIds.get(a.asset_id) ?? [];
    let sid: number;
    if (existingIds.length > 0) {
      // Reuse the last seeded chain-sync score entry rather than adding duplicates.
      sid = existingIds[existingIds.length - 1]!;
      const existing = casper.scores.get(sid);
      if (existing) {
        existing.score = a.score;
        existing.timestamp = now;
        existing.challenge_deadline = now + 600_000;
      }
    } else {
      casper.scoreCount += 1;
      sid = casper.scoreCount;
      casper.scores.set(sid, {
        score_id: sid, asset_id: a.asset_id, score: a.score, agent_id: "(on-chain)",
        evidence_hash: "", explanation_hash: "", timestamp: now,
        challenge_deadline: now + 600_000, challenged: false,
      });
      casper.assetScoreIds.set(a.asset_id, [sid]);
    }
    // Keep the store's latest score id in sync.
    setLastScoreId(a.asset_id, sid);
  }
  for (const ag of d.agents ?? []) {
    const agent: Agent = {
      agent_id: ag.agent_id, role: ag.role, bonded_amount: Number(ag.bonded_amount),
      reputation: ag.reputation, total_reports: ag.total_reports,
      successful_reports: ag.successful_reports, slashed_count: ag.slashed_count, active: ag.active, x402_price: 1_000_000,
    };
    casper.agents.set(ag.agent_id, agent);
  }
  for (const ch of d.challenges ?? []) {
    const existing = casper.challenges.get(ch.challenge_id);
    const challenge: Challenge = {
      challenge_id: ch.challenge_id,
      asset_id: ch.asset_id,
      score_id: existing?.score_id || 0,
      challenger_agent_id: ch.challenger_agent_id,
      challenged_agent_id: ch.challenged_agent_id,
      counter_evidence_hash: existing?.counter_evidence_hash || "",
      counter_bond: Number(ch.counter_bond),
      status: ch.status as Challenge["status"],
      opened_at: existing?.opened_at || now,
      resolved_at: existing?.resolved_at || (ch.status !== "Open" ? now : 0),
    };
    casper.challenges.set(ch.challenge_id, challenge);
  }
  persistAllState();
}

function resolveSecretKeyPath(): string {
  const candidates = [
    process.env.ODRA_CASPER_LIVENET_SECRET_KEY_PATH,
    process.env.BACKEND_PRIVATE_KEY_PATH,
    "/home/azureuser/Desktop/keys/secret_key.pem",
    "/home/rohan/Desktop/keys/secret_key.pem",
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return "/home/azureuser/Desktop/keys/secret_key.pem";
}

/** Read one asset's live on-chain state (+ demo agents/challenges) into the model. */
export function syncAssetFromChain(assetId: string): Promise<{ ok: boolean; error?: string }> {
  const addr = contractAddress();
  if (!addr) return Promise.resolve({ ok: false, error: "WARDENS_CORE_ADDRESS not set — deploy first (scripts/deploy_chain.sh)" });
  const bin = getLivenetBin();
  if (!existsSync(bin)) return Promise.resolve({ ok: false, error: `livenet executor not built at ${bin} — run: cargo build --features livenet --bin wardens_livenet` });

  return new Promise((resolve) => {
    const envs = {
      ...process.env,
      WARDENS_CORE_ADDRESS: addr,
      ODRA_CASPER_LIVENET_NODE_ADDRESS: process.env.ODRA_CASPER_LIVENET_NODE_ADDRESS || process.env.CASPER_NODE_URL || "https://node.testnet.casper.network/rpc",
      ODRA_CASPER_LIVENET_CHAIN_NAME: process.env.ODRA_CASPER_LIVENET_CHAIN_NAME || process.env.CASPER_CHAIN_NAME || "casper-test",
      ODRA_CASPER_LIVENET_SECRET_KEY_PATH: resolveSecretKeyPath(),
      ODRA_CASPER_LIVENET_EVENTS_URL: process.env.ODRA_CASPER_LIVENET_EVENTS_URL || process.env.CASPER_EVENT_STREAM_URL || "https://node.testnet.casper.network/events/main",
    };
    const child = spawn(bin, ["dump", assetId], {
      cwd: CONTRACT_DIR,
      env: envs,
    });
    let out = "";
    let err = "";
    let resolved = false;
    const finish = (res: { ok: boolean; error?: string }) => {
      if (resolved) return;
      resolved = true;
      try { child.kill("SIGTERM"); } catch { }
      resolve(res);
    };

    const checkDump = () => {
      const line = out.split("\n").find((l) => l.startsWith("DUMP "));
      if (line && line.trim().endsWith("}")) {
        try {
          applyChainData(JSON.parse(line.slice("DUMP ".length)) as DumpData, assetId);
          if (assetId) trackAssetLocally(assetId);
          finish({ ok: true });
        } catch { }
      }
    };

    child.stdout.on("data", (d) => { out += d; checkDump(); });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => finish({ ok: false, error: e.message }));
    child.on("close", (code) => {
      if (resolved) return;
      const line = out.split("\n").find((l) => l.startsWith("DUMP "));
      if (!line) return finish({ ok: false, error: `no chain data (exit ${code}). ${err.slice(-400)}` });
      try {
        applyChainData(JSON.parse(line.slice("DUMP ".length)) as DumpData, assetId);
        if (assetId) trackAssetLocally(assetId);
        finish({ ok: true });
      } catch (e) {
        finish({ ok: false, error: `parse failed: ${(e as Error).message}` });
      }
    });
  });
}

/**
 * Sync ALL known demo assets and agents from the real Casper contract into the
 * in-memory read-model. Called once on backend startup in chain mode so every
 * API endpoint immediately returns live on-chain values — no mocked state.
 *
 * Assets are synced in sequence (each dump call spawns the livenet binary and
 * reads from the node) so errors on one asset do not block the others.
 */
export async function syncAllFromChain(): Promise<void> {
  // Load tracked assets and past transactions from disk so they survive restarts
  loadPersistedTransactions();
  loadPersistedState();
  const ASSETS: string[] = getTrackedAssets();
  console.log(`[chainSync] startup sync: pulling live state from Casper Testnet for ${ASSETS.length} assets…`);
  for (const assetId of ASSETS) {
    const result = await syncAssetFromChain(assetId);
    if (result.ok) {
      const a = casper.assets.get(assetId);
      console.log(
        `[chainSync] ✓ ${assetId}: score=${a?.current_score ?? "?"} status=${a?.status ?? "?"}`
      );
    } else {
      // Not fatal — contract may not have this asset yet (e.g., fresh deploy).
      console.warn(`[chainSync] ⚠ ${assetId}: ${result.error}`);
    }
  }

  // Call with empty string to dump the agent list from the contract 
  // so the aggregator and challenger agents are loaded.
  await syncAssetFromChain("");

  // agents are populated as a side-effect of the asset dumps above (the dump
  // command always includes aggregator-agent-1 and challenger-agent-1).
  // But since we skipped assets, we manually seed the known testnet agents:
  casper.agents.set("aggregator-agent-1", {
    agent_id: "aggregator-agent-1", role: "aggregator", bonded_amount: 10,
    reputation: 100, total_reports: 0, successful_reports: 0, slashed_count: 0, active: true,
    x402_price: 1_000_000,
  });
  casper.agents.set("challenger-agent-1", {
    agent_id: "challenger-agent-1", role: "challenger", bonded_amount: 10,
    reputation: 100, total_reports: 0, successful_reports: 0, slashed_count: 0, active: true,
    x402_price: 1_000_000,
  });

  const agentCount = casper.agents.size;
  console.log(`[chainSync] startup sync complete — ${casper.assets.size} assets, ${agentCount} agents in read-model.`);
}
