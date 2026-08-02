import { Router } from "express";
import { casper } from "../services/casperClient.ts";

export const agentsRouter = Router();

// POST /api/agents/register
agentsRouter.post("/register", async (req, res) => {
  try {
    const { agent_id, role } = req.body ?? {};
    if (!agent_id || !role) return res.status(400).json({ error: "agent_id and role required" });
    
    // Check local read-model first to avoid a reverted transaction on-chain
    if (casper.agents.has(agent_id)) {
      return res.json({ deploy_hash: "", agent_id, role, already_registered: true });
    }

    const tx = await casper.registerAgent(agent_id, role);
    res.json({ deploy_hash: tx.deploy_hash, agent_id, role });
  } catch (e) {
    const msg = (e as Error).message;
    // The contract reverts with AgentAlreadyRegistered (code 3) if the agent
    // exists on-chain. Treat that as a non-error so repeated demo runs work.
    if (msg.includes("AgentAlreadyRegistered") || msg.includes("already")) {
      return res.json({ deploy_hash: "", agent_id: req.body?.agent_id, role: req.body?.role, already_registered: true });
    }
    res.status(400).json({ error: msg });
  }
});

// POST /api/agents/bond
agentsRouter.post("/bond", async (req, res) => {
  try {
    const { agent_id, amount } = req.body ?? {};
    if (!agent_id) return res.status(400).json({ error: "agent_id required" });
    const tx = await casper.postBond(agent_id, Number(amount ?? 0));
    res.json({ deploy_hash: tx.deploy_hash, agent_id, amount: Number(amount ?? 0) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// GET /api/agents — reputation view (always returns current in-memory state,
// which is populated from chain on startup and after every mutating call)
agentsRouter.get("/", (_req, res) => {
  res.json([...casper.agents.values()]);
});
