// Wardens Protocol backend orchestrator (Section 9).
// Express server exposing asset / agent / verify / challenge / vault routes and
// an aggregated dashboard-state endpoint. The dashboard reads state from here;
// this backend talks to WardensCore (sim or chain) via casperClient.
import express from "express";
import cors from "cors";
import { casper } from "./services/casperClient.ts";
import { getExplanation, receiptsForAsset, getLastScoreId } from "./services/store.ts";
import { syncAssetFromChain, contractAddress } from "./services/chainSync.ts";
import { assetsRouter } from "./routes/assets.ts";
import { agentsRouter } from "./routes/agents.ts";
import { verifyRouter } from "./routes/verify.ts";
import { challengeRouter } from "./routes/challenge.ts";
import { vaultRouter } from "./routes/vault.ts";

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

// GET /api/dashboard/:asset_id — full state for the one-page dashboard.
app.get("/api/dashboard/:asset_id", (req, res) => {
  const asset_id = req.params.asset_id;
  const asset = casper.assets.get(asset_id);
  if (!asset) return res.status(404).json({ error: "AssetNotFound" });
  const position = casper.positions.get(asset_id) ?? null;
  const challenges = [...casper.challenges.values()].filter((c) => c.asset_id === asset_id);
  const transactions = casper.txs.filter(
    (t) => typeof t.result === "string" // include all; ordered chronologically
  );
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
app.get("/api/transactions", (_req, res) => res.json(casper.txs));

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
// Costs a little gas and takes ~seconds per field — an explicit, on-demand action.
app.post("/api/chain/sync/:asset_id", async (req, res) => {
  if ((process.env.WARDENS_MODE ?? "sim") !== "chain") {
    return res.status(400).json({ error: "backend is not in chain mode (start it with WARDENS_MODE=chain)" });
  }
  const result = await syncAssetFromChain(req.params.asset_id);
  if (!result.ok) return res.status(502).json(result);
  res.json({ ok: true, asset_id: req.params.asset_id });
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => console.log(`[wardens-backend] listening on :${PORT} (mode=${process.env.WARDENS_MODE ?? "sim"})`));
