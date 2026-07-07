import { Router } from "express";
import { casper } from "../services/casperClient.ts";

export const agentsRouter = Router();

// POST /api/agents/register
agentsRouter.post("/register", async (req, res) => {
  try {
    const { agent_id, role } = req.body ?? {};
    if (!agent_id || !role) return res.status(400).json({ error: "agent_id and role required" });

    // Skip on-chain tx if agent is already registered
    if (casper.agents.has(agent_id)) {
      return res.json({ deploy_hash: "", agent_id, role, message: "Agent already registered" });
    }

    const tx = await casper.registerAgent(agent_id, role);
    res.json({ deploy_hash: tx.deploy_hash, agent_id, role });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /api/agents/bond
agentsRouter.post("/bond", async (req, res) => {
  try {
    const { agent_id, amount } = req.body ?? {};
    if (!agent_id) return res.status(400).json({ error: "agent_id required" });

    // Skip on-chain tx if agent already has sufficient bond
    const agent = casper.agents.get(agent_id);
    if (agent && agent.active && agent.bonded_amount >= Number(amount ?? 0)) {
      return res.json({ deploy_hash: "", agent_id, amount: Number(amount ?? 0), message: "Agent already bonded" });
    }

    const tx = await casper.postBond(agent_id, Number(amount ?? 0));
    res.json({ deploy_hash: tx.deploy_hash, agent_id, amount: Number(amount ?? 0) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// GET /api/agents — reputation view
agentsRouter.get("/", (_req, res) => {
  res.json([...casper.agents.values()]);
});
