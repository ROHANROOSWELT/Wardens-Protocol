// Small in-memory read-model the dashboard reads from: x402 receipts and the
// latest human-readable explanation per asset. The chain (or sim) holds the
// authoritative state; this only holds off-chain demo metadata.

export interface X402Receipt {
  asset_id: string;
  verifier_agent: string;
  receipt: string;
  amount: string;
  paid: boolean;
  status402Seen: boolean;
  timestamp: number;
}

const receipts: X402Receipt[] = [];
const explanations = new Map<string, string>();
const lastScoreIdByAsset = new Map<string, number>();

export function addReceipt(r: X402Receipt): void {
  receipts.push(r);
}
export function receiptsForAsset(asset_id: string): X402Receipt[] {
  return receipts.filter((r) => r.asset_id === asset_id);
}
export function setExplanation(asset_id: string, text: string): void {
  explanations.set(asset_id, text);
}
export function getExplanation(asset_id: string): string {
  return explanations.get(asset_id) ?? "";
}
export function setLastScoreId(asset_id: string, id: number): void {
  lastScoreIdByAsset.set(asset_id, id);
}
export function getLastScoreId(asset_id: string): number | undefined {
  return lastScoreIdByAsset.get(asset_id);
}
