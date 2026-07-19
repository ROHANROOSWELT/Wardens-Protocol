// Thin backend client for the dashboard. The dashboard reads all state from the
// backend, which reads from the chain (or sim) on each request — no cache layer.
export const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
export const EXPLORER =
  process.env.NEXT_PUBLIC_CASPER_EXPLORER_BASE ?? "https://testnet.cspr.live/deploy";

export async function getDashboard(assetId: string) {
  try {
    const res = await fetch(`${BACKEND}/api/dashboard/${assetId}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("getDashboard failed", err);
    return null;
  }
}

export async function post(path: string, body: unknown) {
  const res = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export function explorerLink(hash: string): string {
  if (/^[a-fA-F0-9]{64}$/.test(hash)) {
    return `https://testnet.cspr.live/transaction/${hash}`;
  }
  return `${EXPLORER}/${hash}`;
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BACKEND}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const getAssets = () => getJson<any[]>("/api/assets", []);
export const getChallenges = () => getJson<any[]>("/api/challenges", []);
export const getAgents = () => getJson<any[]>("/api/agents", []);
export const getTransactions = () => getJson<any[]>("/api/transactions", []);
export const getChainInfo = () =>
  getJson<{ mode: string; contract: string; contract_url: string }>("/api/chain/info", {
    mode: "sim",
    contract: "",
    contract_url: "",
  });
export const syncChain = (assetId: string) => post(`/api/chain/sync/${assetId}`, {});
/** Sync all known demo assets + agents from chain in one shot (Sync All button). */
export const syncAllChain = () => post("/api/chain/sync", {});

// Shared derived helpers (mirror the on-chain rules for display).
export function ltvForScore(score: number): number {
  if (score >= 90) return 75;
  if (score >= 75) return 60;
  if (score >= 60) return 40;
  if (score >= 50) return 20;
  return 0;
}
export function statusColor(status: string): "green" | "amber" | "red" {
  if (status === "Healthy" || status === "Active") return "green";
  if (status === "Watchlist") return "amber";
  return "red";
}

