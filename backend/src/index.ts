// Wardens Protocol backend orchestrator (Section 9).
// Express server exposing asset / agent / verify / challenge / vault routes and
// an aggregated dashboard-state endpoint. The dashboard reads state from here;
// this backend talks to WardensCore (sim or chain) via casperClient.
import express from "express";
import cors from "cors";
import { casper } from "./services/casperClient.ts";
import { getExplanation, receiptsForAsset, getLastScoreId } from "./services/store.ts";
import { syncAssetFromChain, syncAllFromChain, contractAddress } from "./services/chainSync.ts";
import { assetsRouter } from "./routes/assets.ts";
import { agentsRouter } from "./routes/agents.ts";
import { verifyRouter } from "./routes/verify.ts";
import { challengeRouter } from "./routes/challenge.ts";
import { vaultRouter } from "./routes/vault.ts";
import { phase2Router } from "./routes/phase2.ts";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, mode: process.env.WARDENS_MODE ?? "sim" }));

// List endpoints for the multi-screen dashboard (registered before the routers so
// the bare paths resolve here; /:id paths fall through to the mounted routers).
app.get("/api/assets", (_req, res) => res.json([...casper.assets.values()]));
app.get("/api/challenges", (_req, res) => res.json([...casper.challenges.values()]));

app.use("/api/assets", assetsRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/verify", verifyRouter);
app.use("/api/challenge", challengeRouter);
app.use("/api/vault", vaultRouter);
// Phase 2 — CovenantEngine, ReserveVault, PrivacyStore, Marketplace, Insurance, Arbitration
app.use("/api/p2", phase2Router);

const syncInFlight = new Set<string>();
const lastSync = new Map<string, number>();

// GET /api/dashboard/:asset_id — full state for the one-page dashboard.
// In chain mode: syncs this asset from the real contract first so every field
// reflects the actual on-chain value at the time of the request.
app.get("/api/dashboard/:asset_id", async (req, res) => {
  const asset_id = req.params.asset_id;

  if ((process.env.WARDENS_MODE ?? "sim") === "chain") {
    // Best-effort live sync — don't fail the request if the node is slow.
    const now = Date.now();
    const last = lastSync.get(asset_id) || 0;
    if (!syncInFlight.has(asset_id) && now - last > 60000) {
      syncInFlight.add(asset_id);
      syncAssetFromChain(asset_id).finally(() => {
        syncInFlight.delete(asset_id);
        lastSync.set(asset_id, Date.now());
      });
    }
  }

  const asset = casper.assets.get(asset_id);
  if (!asset) return res.status(404).json({ error: "AssetNotFound" });
  const position = casper.positions.get(asset_id) ?? null;
  const challenges = [...casper.challenges.values()].filter((c) => c.asset_id === asset_id);
  const transactions = casper.txs.map((t) => ({
    ...t,
    confirmed: /^[a-fA-F0-9]{64}$/.test(t.deploy_hash),
  }));
  res.json({
    asset,
    current_score: asset.current_score,
    ltv: casper.currentLtv(asset_id),
    status: asset.status,
    borrowing: casper.currentLtv(asset_id) > 0 && asset.status !== "Frozen" ? "ENABLED" : "DISABLED",
    last_score_id: getLastScoreId(asset_id) ?? null,
    explanation: getExplanation(asset_id),
    agents: [...casper.agents.values()],
    receipts: receiptsForAsset(asset_id),
    challenges,
    position,
    transactions,
  });
});

// Global tx timeline (dashboard timeline helper).
// Returns all transactions; each entry has a `confirmed` boolean.
// Only entries with a real 64-char hex deploy_hash are confirmed on-chain.
app.get("/api/transactions", (_req, res) => {
  const txs = casper.txs.map((t) => ({
    ...t,
    confirmed: /^[a-fA-F0-9]{64}$/.test(t.deploy_hash),
  }));
  res.json(txs);
});

// Chain info: mode + deployed contract, so the dashboard can show a LIVE badge.
app.get("/api/chain/info", (_req, res) => {
  const mode = process.env.WARDENS_MODE ?? "sim";
  const contract = mode === "chain" ? contractAddress() : "";
  res.json({
    mode,
    contract,
    explorer_base: "https://testnet.cspr.live",
    contract_url: contract
      ? `https://testnet.cspr.live/contract-package/${contract.replace(/^contract-package-/, "")}`
      : "",
  });
});

// Pull LIVE on-chain state for one asset into the read-model (chain mode only).
app.post("/api/chain/sync/:asset_id", async (req, res) => {
  if ((process.env.WARDENS_MODE ?? "sim") !== "chain") {
    return res.status(400).json({ error: "backend is not in chain mode" });
  }
  const result = await syncAssetFromChain(req.params.asset_id);
  if (!result.ok) return res.status(502).json(result);
  res.json({ ok: true, asset_id: req.params.asset_id });
});

// Pull ALL known demo assets + agents from chain in one shot (Sync button).
app.post("/api/chain/sync", async (_req, res) => {
  if ((process.env.WARDENS_MODE ?? "sim") !== "chain") {
    return res.status(400).json({ error: "backend is not in chain mode" });
  }
  await syncAllFromChain();
  res.json({ ok: true, assets: casper.assets.size, agents: casper.agents.size });
});

const PORT = Number(process.env.PORT ?? 4000);
const MODE = process.env.WARDENS_MODE ?? "sim";

app.listen(PORT, () => {
  console.log(`[wardens-backend] listening on :${PORT} (mode=${MODE})`);
  if (MODE === "chain") {
    // Pull live on-chain state immediately so the dashboard shows real values
    // from the first request — not empty in-memory placeholders.
    syncAllFromChain().catch((e) =>
      console.error("[wardens-backend] startup chain sync failed:", (e as Error).message)
    );
  }
});
