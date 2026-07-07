import { Router } from "express";
import { casper } from "../services/casperClient.ts";

export const vaultRouter = Router();

// POST /api/vault/deposit { asset_id, collateral_value }
vaultRouter.post("/deposit", async (req, res) => {
  try {
    const { asset_id, collateral_value } = req.body ?? {};

    // Optimisation: skip on-chain tx if already deposited
    const pos = casper.positions.get(asset_id);
    if (pos && pos.collateral_value >= Number(collateral_value ?? 0)) {
      return res.json({ deploy_hash: "", asset_id, message: "Collateral already deposited" });
    }

    const tx = await casper.depositCollateral(asset_id, Number(collateral_value ?? 0));
    res.json({ deploy_hash: tx.deploy_hash, asset_id });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /api/vault/borrow { asset_id, amount }
vaultRouter.post("/borrow", async (req, res) => {
  try {
    const { asset_id, amount } = req.body ?? {};

    // Optimisation: skip on-chain tx if already borrowed
    const pos = casper.positions.get(asset_id);
    if (pos && pos.borrowed_amount >= Number(amount ?? 0)) {
      return res.json({ deploy_hash: "", asset_id, amount: pos.borrowed_amount, message: "Amount already borrowed" });
    }

    const tx = await casper.borrow(asset_id, Number(amount ?? 0));
    res.json({ deploy_hash: tx.deploy_hash, asset_id, amount: Number(amount ?? 0) });
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
