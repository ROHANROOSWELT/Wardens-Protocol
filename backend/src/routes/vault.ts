import { Router } from "express";
import { casper } from "../services/casperClient.ts";

export const vaultRouter = Router();

// POST /api/vault/deposit { asset_id, collateral_value }
vaultRouter.post("/deposit", async (req, res) => {
  try {
    const { asset_id, collateral_value } = req.body ?? {};
    if (!asset_id) return res.status(400).json({ error: "asset_id required" });
    
    casper.depositCollateral(asset_id, Number(collateral_value ?? 0))
      .catch(e => console.error(`[vault] deposit error:`, e));
      
    res.json({ status: "processing", asset_id });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /api/vault/borrow { asset_id, amount }
vaultRouter.post("/borrow", async (req, res) => {
  try {
    const { asset_id, amount } = req.body ?? {};
    if (!asset_id) return res.status(400).json({ error: "asset_id required" });
    
    casper.borrow(asset_id, Number(amount ?? 0))
      .catch(e => console.error(`[vault] borrow error:`, e));
      
    res.json({ status: "processing", asset_id, amount: Number(amount ?? 0) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// GET /api/vault/:asset_id
vaultRouter.get("/:asset_id", (req, res) => {
  const pos = casper.positions.get(req.params.asset_id);
  const ltv = casper.assets.has(req.params.asset_id) ? casper.currentLtv(req.params.asset_id) : 0;
  res.json({ position: pos ?? null, current_ltv: ltv });
});
