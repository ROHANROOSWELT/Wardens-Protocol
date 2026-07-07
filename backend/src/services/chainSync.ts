// Chain read-sync (chain mode only). Populates the backend read-model with LIVE
// on-chain state by invoking the proven Odra livenet executor's `dump` command
// (which reads the deployed contract via the proxy caller). The dashboard then
// serves that real testnet state through the normal /api/dashboard endpoint.
//
// Reads go through the contract (Odra proxy caller) and cost a little gas + take
// ~seconds each, so this is an explicit, on-demand sync — never an auto-poll.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { casper, type Asset, type Agent, type Challenge } from "./casperClient.ts";
import type { AssetStatus } from "./scoreEngine.ts";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url)); // repo root
const CONTRACT_DIR = `${ROOT}/contracts/wardens_core`;
const BIN = `${CONTRACT_DIR}/target/debug/wardens_livenet`;
const STATE_FILE = `${ROOT}/scripts/.chain_state`;

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

function applyChainData(d: DumpData): void {
  const now = Date.now();
  if (d.asset) {
    const a = d.asset;
    const asset: Asset = {
      asset_id: a.asset_id, issuer: a.issuer, debtor: a.debtor,
      face_value: Number(a.face_value), due_date: 0, evidence_hash: "(on-chain)",
      status: a.status as AssetStatus, current_score: a.score, created_at: now, updated_at: now,
    };
    casper.assets.set(a.asset_id, asset);
    // Seed a fresh score so currentLtv() treats it as non-stale (matches chain).
    casper.scoreCount += 1;
    const sid = casper.scoreCount;
    casper.scores.set(sid, {
      score_id: sid, asset_id: a.asset_id, score: a.score, agent_id: "(on-chain)",
      evidence_hash: "", explanation_hash: "", timestamp: now,
      challenge_deadline: now + 600_000, challenged: false,
    });
    casper.assetScoreIds.set(a.asset_id, [sid]);
  }
  for (const ag of d.agents ?? []) {
    const agent: Agent = {
      agent_id: ag.agent_id, role: ag.role, bonded_amount: Number(ag.bonded_amount),
      reputation: ag.reputation, total_reports: ag.total_reports,
      successful_reports: ag.successful_reports, slashed_count: ag.slashed_count, active: ag.active,
    };
    casper.agents.set(ag.agent_id, agent);
  }
  for (const ch of d.challenges ?? []) {
    const challenge: Challenge = {
      challenge_id: ch.challenge_id, asset_id: ch.asset_id, score_id: 0,
      challenger_agent_id: ch.challenger_agent_id, challenged_agent_id: ch.challenged_agent_id,
      counter_evidence_hash: "", counter_bond: Number(ch.counter_bond),
      status: ch.status as Challenge["status"], opened_at: now, resolved_at: 0,
    };
    casper.challenges.set(ch.challenge_id, challenge);
  }
}

/** Read one asset's live on-chain state (+ demo agents/challenges) into the model. */
export function syncAssetFromChain(assetId: string): Promise<{ ok: boolean; error?: string }> {
  const addr = contractAddress();
  if (!addr) return Promise.resolve({ ok: false, error: "WARDENS_CORE_ADDRESS not set — deploy first (scripts/deploy_chain.sh)" });
  if (!existsSync(BIN)) return Promise.resolve({ ok: false, error: `livenet executor not built at ${BIN} — run: cargo build --features livenet --bin wardens_livenet` });

  return new Promise((resolve) => {
    const envs = {
      ...process.env,
      WARDENS_CORE_ADDRESS: addr,
      ODRA_CASPER_LIVENET_NODE_ADDRESS: process.env.ODRA_CASPER_LIVENET_NODE_ADDRESS || process.env.CASPER_NODE_URL || "",
      ODRA_CASPER_LIVENET_CHAIN_NAME: process.env.ODRA_CASPER_LIVENET_CHAIN_NAME || process.env.CASPER_CHAIN_NAME || "",
      ODRA_CASPER_LIVENET_SECRET_KEY_PATH: process.env.ODRA_CASPER_LIVENET_SECRET_KEY_PATH || process.env.BACKEND_PRIVATE_KEY_PATH || "",
      ODRA_CASPER_LIVENET_EVENTS_URL: process.env.ODRA_CASPER_LIVENET_EVENTS_URL || process.env.CASPER_EVENT_STREAM_URL || "",
    };
    const child = spawn(BIN, ["dump", assetId], {
      cwd: CONTRACT_DIR,
      env: envs,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => resolve({ ok: false, error: e.message }));
    child.on("close", (code) => {
      const line = out.split("\n").find((l) => l.startsWith("DUMP "));
      if (!line) return resolve({ ok: false, error: `no chain data (exit ${code}). ${err.slice(-400)}` });
      try {
        applyChainData(JSON.parse(line.slice("DUMP ".length)) as DumpData);
        resolve({ ok: true });
      } catch (e) {
        resolve({ ok: false, error: `parse failed: ${(e as Error).message}` });
      }
    });
  });
}
