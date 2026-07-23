"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { post, getChainInfo, explorerLink } from "../../lib/api";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

async function getJson<T>(path: string, fb: T): Promise<T> {
  try {
    const r = await fetch(`${BACKEND}${path}`, { cache: "no-store" });
    return r.ok ? (await r.json()) as T : fb;
  } catch { return fb; }
}

const covenantColor = (state: string) =>
  state === "FullAccess" ? "#2FD98A" :
  state === "Monitored"  ? "#f5a623" :
  state === "DrawsFrozen" ? "#f55a23" : "#ba1a1a";

const covenantIcon = (state: string) =>
  state === "FullAccess" ? "verified" :
  state === "Monitored" ? "visibility" :
  state === "DrawsFrozen" ? "lock" : "emergency";

type Tranche = { tranche_id: number; asset_id: string; amount: number; released: boolean; blocked: boolean };
type Commitment = { commitment_id: number; asset_id: string; committer: string; merkle_root: string; revealed: boolean };
type Vote = { agent_id: string; vote: boolean };

export default function Phase2Dashboard() {
  const [chain, setChain] = useState<{ mode: string }>({ mode: "sim" });
  const [asset, setAsset] = useState("INV-001");
  const [covenant, setCovenant] = useState<any>(null);
  const [tranches, setTranches] = useState<Tranche[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [dynamicAssets, setDynamicAssets] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const note = (m: string) => setLog((l) => [m, ...l].slice(0, 12));

  const refresh = useCallback(async () => {
    const [c, cov, tr, cm, pr, aList] = await Promise.all([
      getJson<{ mode: string }>("/api/chain/info", { mode: "sim" }),
      getJson(`/api/p2/covenant/${asset}`, null),
      getJson<Tranche[]>(`/api/p2/reserve/tranches/${asset}`, []),
      getJson<Commitment[]>(`/api/p2/privacy/commitments/${asset}`, []),
      getJson<any[]>("/api/p2/marketplace/prices", []),
      getJson<any[]>("/api/assets", []),
    ]);
    setChain(c); setCovenant(cov); setTranches(tr); setCommitments(cm); setPrices(pr);
    
    // update dynamic asset list 
    const fetchedIds = aList.map((a: any) => a.asset_id);
    setDynamicAssets(fetchedIds);
    if (fetchedIds.length > 0 && !fetchedIds.includes(asset)) {
      setAsset(fetchedIds[0]);
    }
  }, [asset]);

  useEffect(() => { refresh(); const i = setInterval(refresh, 5000); return () => clearInterval(i); }, [refresh]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); }
    catch (e) { note(`✗ ${label}: ${(e as Error).message}`); }
    finally { await refresh(); setBusy(false); }
  }

  const createTranche = () => run("Create tranche", async () => {
    const r = await post("/api/p2/reserve/tranche", { asset_id: asset, amount: 500 });
    note(r.ok ? `✓ Tranche #${r.data.tranche_id} created (500 CSPR)` : `✗ ${r.data.error}`);
  });

  const releaseTranche = () => run("Release tranche", async () => {
    const pending = tranches.find((t) => !t.released && !t.blocked);
    if (!pending) return note("✗ No pending tranche");
    const r = await post("/api/p2/reserve/release", { tranche_id: pending.tranche_id });
    note(r.ok ? `✓ Tranche #${pending.tranche_id} released` : `✗ ${r.data.error} — ${r.data.reason ?? ""}`);
  });

  const commitEvidence = () => run("Store evidence commitment", async () => {
    const root = `sha256:merkle-${Date.now().toString(36)}`;
    const r = await post("/api/p2/privacy/commit", { asset_id: asset, committer: "aggregator-agent-1", merkle_root: root });
    note(r.ok ? `✓ Commitment #${r.data.commitment_id} stored` : `✗ ${r.data.error}`);
  });

  const revealEvidence = () => run("Reveal evidence", async () => {
    const pending = commitments.find((c) => !c.revealed);
    if (!pending) return note("✗ No unrevealed commitment");
    const r = await post("/api/p2/privacy/reveal", { commitment_id: pending.commitment_id, reveal_hash: pending.merkle_root });
    note(r.ok ? `✓ Commitment #${pending.commitment_id} revealed` : `✗ ${r.data.error}`);
  });

  const underwrite = () => run("Insurance underwriting (x402)", async () => {
    const r = await post("/api/p2/insurance/underwrite", { asset_id: asset });
    if (r.ok) {
      note(`✓ Insurance score ${r.data.insurance_score}/100 | Covenant: ${r.data.covenant_state}`);
    } else {
      note(`✗ ${r.data.error}`);
    }
  });

  const castVote = (upheld: boolean) => run(`Arbitration vote (${upheld ? "upheld" : "rejected"})`, async () => {
    // Use the first open challenge.
    const challenges = await getJson<any[]>("/api/challenges", []);
    const open = challenges.find((c) => c.status === "Open" || c.status === "InArbitration");
    if (!open) return note("✗ No open challenge to vote on");

    // Use a real registered agent as the arbitrator, not a fabricated client-side ID.
    const allAgents = await getJson<any[]>("/api/agents", []);
    const arbAgent = allAgents.find((a: any) =>
      a.active && (a.role === "Challenger" || a.role === "challenger" ||
                   a.role === "Aggregator" || a.role === "aggregator")
    );
    if (!arbAgent) return note("✗ No active registered agent available to cast vote");
    const arb_id = arbAgent.agent_id;

    const r = await post("/api/p2/arbitration/vote", {
      challenge_id: open.challenge_id,
      arbitrator_id: arb_id,
      vote_upheld: upheld,
    });
    if (r.ok) {
      note(r.data.resolved
        ? `✓ Vote cast by ${arb_id} → Challenge #${open.challenge_id} auto-resolved (upheld=${r.data.upheld})`
        : `✓ Vote cast by ${arb_id} (${r.data.upheld_votes}/${r.data.needed} needed)`);
    } else {
      note(`✗ ${r.data.error}`);
    }
  });

  return (
    <div className="p-margin-mobile md:p-margin-desktop container mx-auto max-w-7xl flex flex-col gap-lg">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-md">
        <div>
          <h1 className="text-display-sm font-black uppercase tracking-tighter mb-1">
            Covenant Engine (Modular Architecture)
          </h1>
          <p className="text-body-lg text-on-surface-variant mt-xs border-l-[4px] border-secondary pl-sm">
            CovenantEngine · ReserveVault · PrivacyCommitmentStore · Marketplace · Insurance
          </p>
        </div>
        <div className="flex gap-sm items-center">
          {chain.mode === "chain" && (
            <span className="border-[3px] border-[#2FD98A] text-[#0a7d4b] bg-[#2FD98A]/15 text-label-md uppercase tracking-widest px-sm py-xs">
              🟢 Live · Testnet
            </span>
          )}
          <Link href="/dashboard" className="border-[3px] border-on-surface bg-surface text-label-md uppercase px-sm py-xs neobrutalist-btn">
            ← Control Room
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-sm flex-wrap">
        <span className="text-label-md uppercase tracking-widest">Asset:</span>
        {dynamicAssets.map((id) => (
          <button key={id} onClick={() => setAsset(id)}
            className={`border-[3px] px-sm py-xs text-label-md uppercase tracking-wide neobrutalist-btn ${asset === id ? "border-primary bg-primary-container text-on-primary" : "border-on-surface bg-surface"}`}>
            {id}
          </button>
        ))}
        {dynamicAssets.length === 0 && <span className="text-body-sm text-on-surface-variant">No assets found</span>}
      </div>

      {/* Covenant Engine */}
      <div className="border-[4px] border-on-surface neobrutalist-shadow p-md bg-surface">
        <h2 className="text-headline-md font-black uppercase border-b-[3px] border-on-surface pb-sm mb-md">
          CovenantEngine
        </h2>
        {covenant ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
            <div className="border-[3px] p-md" style={{ borderColor: covenantColor(covenant.state) }}>
              <div className="text-label-md uppercase tracking-widest opacity-70">State</div>
              <div className="flex items-center gap-xs mt-xs">
                <span className="material-symbols-outlined" style={{ color: covenantColor(covenant.state), fontVariationSettings: "'FILL' 1" }}>
                  {covenantIcon(covenant.state)}
                </span>
                <span className="text-headline-sm font-black" style={{ color: covenantColor(covenant.state) }}>
                  {covenant.state}
                </span>
              </div>
            </div>
            <div className="border-[3px] border-on-surface p-md">
              <div className="text-label-md uppercase tracking-widest opacity-70">Score</div>
              <div className="text-headline-sm font-black mt-xs">{covenant.score}</div>
            </div>
            <div className="border-[3px] border-on-surface p-md">
              <div className="text-label-md uppercase tracking-widest opacity-70">Draws</div>
              <div className={`text-headline-sm font-black mt-xs ${covenant.draws_frozen ? "text-error" : "text-[#2FD98A]"}`}>
                {covenant.draws_frozen ? "FROZEN" : "ALLOWED"}
              </div>
            </div>
            <div className="border-[3px] border-on-surface p-md">
              <div className="text-label-md uppercase tracking-widest opacity-70">Tranche Release</div>
              <div className={`text-headline-sm font-black mt-xs ${covenant.tranche_allowed ? "text-[#2FD98A]" : "text-error"}`}>
                {covenant.tranche_allowed ? "ENABLED" : "BLOCKED"}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-on-surface-variant text-body-md">No covenant data — run Verify first.</div>
        )}
      </div>

      {/* Reserve Vault + Privacy Store side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">

        {/* Reserve Vault */}
        <div className="border-[4px] border-on-surface neobrutalist-shadow p-md bg-surface">
          <h2 className="text-headline-md font-black uppercase border-b-[3px] border-on-surface pb-sm mb-md">
            ReserveVault
          </h2>
          <div className="flex gap-sm flex-wrap mb-md">
            <button onClick={createTranche} disabled={busy}
              className="border-[3px] border-on-surface bg-surface text-label-md uppercase px-sm py-xs neobrutalist-btn disabled:opacity-50">
              Create Tranche
            </button>
            <button onClick={releaseTranche} disabled={busy}
              className="border-[3px] border-[#2FD98A] bg-[#2FD98A]/10 text-label-md uppercase px-sm py-xs neobrutalist-btn disabled:opacity-50">
              Release Tranche
            </button>
          </div>
          <div className="flex flex-col gap-xs max-h-[180px] overflow-auto">
            {tranches.length === 0 && <div className="text-on-surface-variant text-body-sm">No tranches yet.</div>}
            {tranches.map((t) => (
              <div key={t.tranche_id} className={`flex justify-between border-[2px] px-sm py-xs text-body-sm font-mono-plex ${t.released ? "border-[#2FD98A] bg-[#2FD98A]/10" : t.blocked ? "border-error bg-error/10" : "border-on-surface"}`}>
                <span>Tranche #{t.tranche_id}</span>
                <span>{t.amount} CSPR</span>
                <span className="uppercase font-bold">{t.released ? "Released" : t.blocked ? "Blocked" : "Pending"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Privacy Commitment Store */}
        <div className="border-[4px] border-on-surface neobrutalist-shadow p-md bg-surface">
          <h2 className="text-headline-md font-black uppercase border-b-[3px] border-on-surface pb-sm mb-md">
            PrivacyCommitmentStore
          </h2>
          <div className="flex gap-sm flex-wrap mb-md">
            <button onClick={commitEvidence} disabled={busy}
              className="border-[3px] border-on-surface bg-surface text-label-md uppercase px-sm py-xs neobrutalist-btn disabled:opacity-50">
              Commit Evidence
            </button>
            <button onClick={revealEvidence} disabled={busy}
              className="border-[3px] border-[#6C698D] bg-[#6C698D]/10 text-label-md uppercase px-sm py-xs neobrutalist-btn disabled:opacity-50">
              Reveal Evidence
            </button>
          </div>
          <div className="flex flex-col gap-xs max-h-[180px] overflow-auto">
            {commitments.length === 0 && <div className="text-on-surface-variant text-body-sm">No commitments yet.</div>}
            {commitments.map((c) => (
              <div key={c.commitment_id} className={`border-[2px] px-sm py-xs text-body-sm font-mono-plex ${c.revealed ? "border-[#2FD98A]" : "border-on-surface"}`}>
                <div className="flex justify-between">
                  <span>#{c.commitment_id} — {c.committer}</span>
                  <span className={`uppercase font-bold ${c.revealed ? "text-[#2FD98A]" : ""}`}>{c.revealed ? "Revealed" : "Hidden"}</span>
                </div>
                <div className="text-on-surface-variant truncate">{c.merkle_root}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Multi-agent arbitration + Insurance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">

        {/* Multi-agent arbitration */}
        <div className="border-[4px] border-on-surface neobrutalist-shadow p-md bg-surface">
          <h2 className="text-headline-md font-black uppercase border-b-[3px] border-on-surface pb-sm mb-md">
            Multi-Agent Arbitration
          </h2>
          <p className="text-body-sm text-on-surface-variant mb-md">
            Phase 2 replaces admin resolver with weighted-reputation voting. Challenge auto-resolves at 2 votes.
          </p>
          <div className="flex gap-sm flex-wrap">
            <button onClick={() => castVote(true)} disabled={busy}
              className="border-[3px] border-error bg-error/10 text-label-md uppercase px-sm py-xs neobrutalist-btn disabled:opacity-50">
              Vote: Upheld
            </button>
            <button onClick={() => castVote(false)} disabled={busy}
              className="border-[3px] border-on-surface bg-surface text-label-md uppercase px-sm py-xs neobrutalist-btn disabled:opacity-50">
              Vote: Rejected
            </button>
          </div>
        </div>

        {/* Insurance underwriting */}
        <div className="border-[4px] border-on-surface neobrutalist-shadow p-md bg-surface">
          <h2 className="text-headline-md font-black uppercase border-b-[3px] border-on-surface pb-sm mb-md">
            Insurance Underwriting (x402)
          </h2>
          <p className="text-body-sm text-on-surface-variant mb-md">
            Insurance agent evaluates trust score, covenant state, issuer risk flag, and LTV to compute premium bps + coverage %.
          </p>
          <button onClick={underwrite} disabled={busy}
            className="border-[3px] border-primary bg-primary-container text-on-primary text-label-md uppercase px-sm py-xs neobrutalist-btn disabled:opacity-50">
            Underwrite via x402
          </button>
        </div>
      </div>

      {/* Verifier Marketplace */}
      <div className="border-[4px] border-on-surface neobrutalist-shadow p-md bg-surface">
        <h2 className="text-headline-md font-black uppercase border-b-[3px] border-on-surface pb-sm mb-md">
          Verifier Marketplace — Dynamic x402 Pricing
        </h2>
        <div className="flex flex-col gap-xs">
          {prices.length === 0 && <div className="text-on-surface-variant text-body-sm">No agents in marketplace yet.</div>}
          {prices.map((p) => (
            <div key={p.agent_id} className="grid grid-cols-4 gap-md border-[2px] border-on-surface px-sm py-xs text-body-sm font-mono-plex">
              <span className="font-bold">{p.agent_id}</span>
              <span className="uppercase text-on-surface-variant">{p.role}</span>
              <span>Rep: <b>{p.reputation}</b></span>
              <span>Price: <b>{(p.x402_price / 1_000_000).toFixed(2)} CSPR</b>
                {p.reputation_discount_pct > 0 && (
                  <span className="text-[#2FD98A] ml-xs">(-{p.reputation_discount_pct}%)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Console log */}
      <div className="border-[4px] border-on-surface bg-surface-container-high p-md">
        <h2 className="text-headline-sm font-black uppercase mb-sm">Console</h2>
        <div className="flex flex-col gap-base font-mono-plex text-body-sm">
          {log.length === 0 && <span className="text-on-surface-variant">No actions yet.</span>}
          {log.map((l, i) => <div key={i} className="text-on-surface-variant">{l}</div>)}
        </div>
      </div>
    </div>
  );
}
