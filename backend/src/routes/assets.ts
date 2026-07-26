import { Router } from "express";
import { casper } from "../services/casperClient.ts";
import { canonicalizeAndHash } from "../services/evidenceHasher.ts";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const CACHE_DIR = `${ROOT}/backend/.local`;
const OFFCHAIN_FILE = `${CACHE_DIR}/offchain_data.json`;

export const assetsRouter = Router();

// In-memory store for off-chain RWA metadata (simulating IPFS or a secure data vault)
export const offchainData = new Map<string, { invoice_number: string, invoice_file_content: string }>();

function loadOffchain() {
  if (existsSync(OFFCHAIN_FILE)) {
    try {
      const data = JSON.parse(readFileSync(OFFCHAIN_FILE, "utf8"));
      for (const [k, v] of Object.entries(data)) {
        offchainData.set(k, v as any);
      }
    } catch {}
  }
}
loadOffchain();

function saveOffchain() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(OFFCHAIN_FILE, JSON.stringify(Object.fromEntries(offchainData)));
}

// POST /api/assets — hash invoice data, create the asset on Casper.
assetsRouter.post("/", async (req, res) => {
  try {
    let { asset_id, issuer, debtor, faceValue, dueDate, invoice_number, invoice_file_content } = req.body ?? {};
    
    // Support legacy snake_case for backward compatibility with tests/scripts
    const fv = faceValue !== undefined ? faceValue : req.body.face_value;
    const dd = dueDate !== undefined ? dueDate : req.body.due_date;
    
    const face_value = Number(fv ?? 0);
    const due_date = typeof dd === "string" ? Math.floor(new Date(dd).getTime() / 1000) : Number(dd ?? 0);

    if (!issuer || typeof issuer !== "string" || issuer.trim().length === 0 || issuer.length > 100) {
      return res.status(400).json({ error: "Invalid issuer: must be a string between 1 and 100 characters" });
    }
    if (!debtor || typeof debtor !== "string" || debtor.trim().length === 0 || debtor.length > 100) {
      return res.status(400).json({ error: "Invalid debtor: must be a string between 1 and 100 characters" });
    }
    if (isNaN(face_value) || face_value <= 0) {
      return res.status(400).json({ error: "Invalid faceValue: must be a number greater than 0" });
    }
    if (!dd || isNaN(due_date) || due_date * 1000 <= Date.now()) {
      return res.status(400).json({ error: "Invalid dueDate: must be a valid future date" });
    }

    if (!asset_id) {
      asset_id = `INV-${Date.now()}-${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
    }

    const evidence_hash = canonicalizeAndHash({ asset_id, issuer, debtor, face_value, due_date });
    // Store the off-chain file / details
    offchainData.set(asset_id, {
      invoice_number: invoice_number || asset_id,
      invoice_file_content: invoice_file_content || "{}"
    });
    saveOffchain();

    casper.createAsset({
      asset_id,
      issuer,
      debtor,
      face_value,
      due_date,
      evidence_hash,
    }).catch(e => console.error(`[assets] async createAsset error for ${asset_id}:`, e));

    res.json({ status: "processing", evidence_hash, asset_id });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

assetsRouter.get("/:asset_id", (req, res) => {
  const a = casper.assets.get(req.params.asset_id);
  if (!a) return res.status(404).json({ error: "AssetNotFound" });
  res.json(a);
});

assetsRouter.get("/", (req, res) => {
  const all = Array.from(casper.assets.values());
  res.json(all);
});

assetsRouter.get("/doc/:asset_id", (req, res) => {
  const doc = offchainData.get(req.params.asset_id);
  if (!doc) return res.status(404).json({ error: "DocumentNotFound" });
  res.json(doc);
});
