import { Router } from "express";
import { casper } from "../services/casperClient.ts";

export const agentsRouter = Router();

// POST /api/agents/register
agentsRouter.post("/register", (req, res) => {
  try {
    const { agent_id, role } = req.body ?? {};
    if (!agent_id || !role) return res.status(400).json({ error: "agent_id and role required" });
    const tx = casper.registerAgent(agent_id, role);
    res.json({ deploy_hash: tx.deploy_hash, agent_id, role });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /api/agents/bond
agentsRouter.post("/bond", (req, res) => {
  try {
    const { agent_id, amount } = req.body ?? {};
    if (!agent_id) return res.status(400).json({ error: "agent_id required" });
    const tx = casper.postBond(agent_id, Number(amount ?? 0));
    res.json({ deploy_hash: tx.deploy_hash, agent_id, amount: Number(amount ?? 0) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// GET /api/agents — reputation view
agentsRouter.get("/", (_req, res) => {
  res.json([...casper.agents.values()]);
});
