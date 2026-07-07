"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getDashboard, getAssets, getAgents, getTransactions, getChainInfo,
  post, syncChain, explorerLink, ltvForScore,
} from "../../lib/api";


function scoreColor(s: number) {
  return s >= 75 ? "#2FD98A" : s >= 50 ? "#f5a623" : "#ba1a1a";
}

export default function ControlRoom() {
  const [asset, setAsset] = useState<string>("");
  const [assets, setAssets] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [chain, setChain] = useState<{ mode: string; contract_url: string }>({ mode: "sim", contract_url: "" });
  const [sel, setSel] = useState<any>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const pathD = useMemo(() => {
    const points = txs
      .filter((t) => t.action === "submit_score" || t.action === "freeze_asset" || t.action === "resolve_challenge")
      .map((t) => {
        if (t.action === "submit_score") {
          const match = t.result.match(/Score\s+(\d+)/i);
          return match ? parseInt(match[1], 10) : 0;
        }
        if (t.action === "freeze_asset" || t.result.toLowerCase().includes("slashed")) {
          return 0;
        }
        return null;
      })
      .filter((val) => val !== null) as number[];

    const scores = points.length > 0 ? points : [0];
    if (scores.length === 1) {
      const y = 180 - (scores[0] / 100) * 160;
      return `M0,${y.toFixed(1)} L1000,${y.toFixed(1)}`;
    }
    return scores
      .map((score, i) => {
        const x = (i / (scores.length - 1)) * 1000;
        const y = 180 - (score / 100) * 160;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [txs]);

  const refresh = useCallback(async () => {
    const [a, g, t, c, s] = await Promise.all([
      getAssets(), getAgents(), getTransactions(), getChainInfo(), asset ? getDashboard(asset) : null,
    ]);
    setAssets(a); setAgents(g); setTxs(t); setChain(c); setSel(s);
  }, [asset]);

  useEffect(() => { refresh(); const i = setInterval(refresh, 3000); return () => clearInterval(i); }, [refresh]);

  useEffect(() => {
    if (!asset && assets.length > 0) setAsset(assets[0].asset_id);
  }, [assets, asset]);

  const isChain = chain.mode === "chain";
  const note = (m: string) => setLog((l) => [m, ...l].slice(0, 10));
  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      note(`✗ ${label}: ${(e as Error).message}`);
    } finally {
      try {
        await refresh();
      } catch (err) {
        console.error("refresh failed", err);
      }
      setBusy(false);
    }
  }
  const ensureAgents = async () => {
    for (const [id, role] of [["aggregator-agent-1", "Aggregator"], ["challenger-agent-1", "Challenger"]] as const) {
      await post("/api/agents/register", { agent_id: id, role });
      await post("/api/agents/bond", { agent_id: id, amount: 10 });
    }
  };
  const verify = () => run("verify", async () => {
    if (!asset) return note("✗ no asset selected");
    await ensureAgents();
    const r = await post("/api/verify", { asset_id: asset });
    note(r.ok ? `✓ verified ${asset} → score ${r.data.final_score}` : `✗ ${r.data.error}`);
  });
  const borrow = () => run("borrow", async () => {
    if (!asset) return note("✗ no asset selected");
    const currentAsset = assets.find((a) => a.asset_id === asset);
    const fv = currentAsset ? currentAsset.face_value : 0;
    if (fv <= 0) return note("✗ invalid face value");
    await post("/api/vault/deposit", { asset_id: asset, collateral_value: fv });
    const amt = Math.floor(fv * 0.7);
    const r = await post("/api/vault/borrow", { asset_id: asset, amount: amt });
    note(r.ok ? `✓ borrowed ${amt}` : `✗ ${r.data.error}`);
  });
  const lying = () => run("lying score", async () => {
    if (!asset) return note("✗ no asset selected");
    await ensureAgents();
    const r = await post("/api/verify/manual", { asset_id: asset, score: 90 });
    note(r.ok ? `✓ dishonest 90 posted on ${asset}` : `✗ ${r.data.error}`);
  });
  const challenge = () => run("challenge", async () => {
    if (!sel?.last_score_id) return note("✗ no score to challenge");
    const r = await post("/api/challenge/open", { score_id: sel.last_score_id, challenger_agent_id: "challenger-agent-1", reason: "Independent recheck: invoice already paid" });
    note(r.ok ? `✓ challenge #${r.data.challenge_id} opened` : `✗ ${r.data.error}`);
  });
  const resolve = () => run("resolve", async () => {
    const open = (sel?.challenges ?? []).find((c: any) => c.status === "Open");
    if (!open) return note("✗ no open challenge");
    const r = await post("/api/challenge/resolve", { challenge_id: open.challenge_id, upheld: true });
    note(r.ok ? `✓ challenge #${open.challenge_id} upheld — verifier slashed` : `✗ ${r.data.error}`);
  });
  const sync = () => { setSyncing(true); syncChain(asset).then((r) => note(r.ok ? `⛓ synced ${asset} from testnet` : `✗ ${r.data.error}`)).finally(() => { refresh(); setSyncing(false); }); };

  // System trust score = average of tracked assets' current scores.
  const scored = assets.filter((a) => a.current_score > 0);
  const sysScore = scored.length ? Math.round(scored.reduce((s, a) => s + a.current_score, 0) / scored.length) : 0;
  const C = 251.33;
  const slashed = agents.filter((a) => a.slashed_count > 0).length;

  return (
    <div className="p-margin-mobile md:p-margin-desktop container mx-auto max-w-7xl flex flex-col gap-lg md:gap-xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-md">
        <div>
          <h1 className="text-headline-lg md:text-headline-xl font-black uppercase tracking-tighter">Control Room</h1>
          <p className="text-body-lg text-on-surface-variant mt-xs border-l-[4px] border-primary-container pl-sm">
            System-wide monitoring and protocol oversight.
          </p>
        </div>
        <div className="flex items-center gap-sm">
          {isChain ? (
            <a href={chain.contract_url} target="_blank" rel="noreferrer" className="border-[3px] border-[#2FD98A] text-[#0a7d4b] bg-[#2FD98A]/15 text-label-md uppercase tracking-widest px-sm py-xs">🟢 Live · Testnet</a>
          ) : (
            <span className="border-[3px] border-on-surface bg-surface-container-highest text-label-md uppercase tracking-widest px-sm py-xs">Sim mode</span>
          )}
          {isChain && (
            <button onClick={sync} disabled={syncing} className="border-[3px] border-on-surface bg-surface-container-highest text-label-md uppercase tracking-widest px-sm py-xs neobrutalist-btn flex items-center gap-xs">
              <span className="material-symbols-outlined">sync</span>{syncing ? "Syncing…" : "Sync"}
            </button>
          )}
        </div>
      </div>

      {/* Hero: gauge + ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        <div className="lg:col-span-1 border-[4px] border-on-surface bg-surface neobrutalist-shadow p-lg flex flex-col items-center justify-between min-h-[350px]">
          <div className="w-full">
            <h2 className="text-label-md uppercase tracking-widest bg-on-surface text-surface px-sm py-xs border-[2px] border-on-surface inline-block">System Trust Score</h2>
          </div>
          <div className="relative w-48 h-48 my-md">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle className="text-surface-container-highest" cx="50" cy="50" fill="none" r="40" stroke="currentColor" strokeWidth="8" />
              <circle cx="50" cy="50" fill="none" r="40" stroke={scoreColor(sysScore)} strokeDasharray={C} strokeDashoffset={C * (1 - sysScore / 100)} strokeLinecap="butt" strokeWidth="12" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-headline-xl font-black tracking-tighter">{sysScore}</span>
            </div>
          </div>
          <div className="flex items-center gap-xs text-label-md uppercase tracking-widest border-[2px] px-sm py-xs" style={{ color: scoreColor(sysScore), borderColor: scoreColor(sysScore) }}>
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>{sysScore >= 75 ? "verified" : sysScore >= 50 ? "warning" : "gpp_bad"}</span>
            {sysScore >= 75 ? "Optimal" : sysScore >= 50 ? "Monitored" : "At risk"}
          </div>
        </div>

        <div className="lg:col-span-2 border-[4px] border-on-surface bg-surface neobrutalist-shadow p-md flex flex-col min-h-[350px] overflow-hidden">
          <div className="flex justify-between items-center mb-md border-b-[4px] border-on-surface pb-sm">
            <h2 className="text-headline-md font-black uppercase">Signature Trust Ledger</h2>
            <span className="border-[2px] border-on-surface bg-on-surface text-surface px-xs py-base text-label-md uppercase">Live</span>
          </div>
          <div className="flex-grow w-full relative mt-sm">
            <svg className="w-full h-full absolute inset-0" preserveAspectRatio="none" viewBox="0 0 1000 200">
              <path d={pathD} fill="none" stroke="#1b1c16" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <path className="pulse-path" d={pathD} fill="none" stroke="#6C698D" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="text-label-md text-on-surface-variant uppercase mt-sm">{txs.length} on-chain actions recorded</div>
        </div>
      </div>

      {/* Real stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        <StatCard label="Tracked Assets" value={String(assets.length)} sub={`${scored.length} scored`} />
        <StatCard label="On-chain Transactions" value={String(txs.length)} sub={isChain ? "Casper Testnet" : "sim"} />
        <StatCard label="Slashed Verifiers" value={String(slashed)} sub={`${agents.length} agents registered`} highlight={slashed > 0} />
      </div>

      {/* Console */}
      <div className="border-[4px] border-on-surface bg-surface-container-high neobrutalist-shadow p-md flex flex-col gap-md">
        <div className="flex justify-between items-center border-b-[3px] border-on-surface pb-sm">
          <h2 className="text-headline-md font-black uppercase">Console</h2>
          {assets.length > 0 ? (
            <select value={asset} onChange={(e) => setAsset(e.target.value)} className="border-[3px] border-on-surface bg-surface px-sm py-xs text-label-md uppercase font-mono-plex">
              {assets.map((a) => <option key={a.asset_id} value={a.asset_id}>{a.asset_id}</option>)}
            </select>
          ) : (
            <span className="text-on-surface-variant text-label-md uppercase">No assets yet</span>
          )}
        </div>
        {assets.length === 0 ? (
          <div className="text-body-md text-on-surface-variant">
            No assets yet, create one from <Link href="/vault" className="underline font-bold">Vault Registry</Link>.
          </div>
        ) : (
          <div className="flex flex-wrap gap-sm">
            <ActBtn onClick={verify} busy={busy} primary>1 · Verify (x402)</ActBtn>
            <ActBtn onClick={borrow} busy={busy}>2 · Deposit + borrow</ActBtn>
            <ActBtn onClick={lying} busy={busy}>Post dishonest score</ActBtn>
            <ActBtn onClick={challenge} busy={busy}>Open challenge</ActBtn>
            <ActBtn onClick={resolve} busy={busy}>Resolve: slash</ActBtn>
            <Link href={`/asset/${asset}`} className="border-[3px] border-on-surface bg-surface text-label-md uppercase tracking-widest px-sm py-xs neobrutalist-btn">Open asset →</Link>
          </div>
        )}
        {sel && (
          <div className="flex flex-wrap gap-md text-body-md font-mono-plex border-t-[3px] border-on-surface pt-sm">
            <span>score <b>{sel.current_score}</b></span>
            <span>ltv <b>{sel.ltv}%</b></span>
            <span>status <b style={{ color: scoreColor(sel.current_score) }}>{sel.status}</b></span>
            <span>borrowing <b>{sel.borrowing}</b></span>
          </div>
        )}
        <div className="flex flex-col gap-base font-mono-plex text-body-md">
          {log.map((l, i) => <div key={i} className="text-on-surface-variant">{l}</div>)}
        </div>
      </div>

      {/* Tx timeline */}
      <div className="border-[4px] border-on-surface bg-surface neobrutalist-shadow p-md">
        <h2 className="text-headline-md font-black uppercase border-b-[3px] border-on-surface pb-sm mb-sm">Casper Transaction Timeline</h2>
        <div className="flex flex-col gap-xs max-h-[300px] overflow-auto">
          {txs.slice().reverse().map((t, i) => (
            <a key={i} href={explorerLink(t.deploy_hash)} target="_blank" rel="noreferrer"
              className="flex justify-between gap-md border-[2px] border-on-surface bg-surface-container-low px-sm py-xs hover:bg-primary-fixed transition-colors">
              <span className="font-bold uppercase text-label-md">{t.action}</span>
              <span className="text-on-surface-variant text-body-md truncate">{t.result}</span>
              <span className="font-mono-plex text-label-md text-primary">{t.deploy_hash.slice(0, 14)}…</span>
            </a>
          ))}
          {txs.length === 0 && <div className="text-on-surface-variant">No transactions yet — run the console.</div>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={`border-[4px] border-on-surface neobrutalist-shadow p-md ${highlight ? "bg-error text-on-error" : "bg-surface-container-highest"}`}>
      <h3 className="text-label-md uppercase tracking-widest opacity-80 mb-xs">{label}</h3>
      <div className="text-headline-lg font-black">{value}</div>
      <div className="mt-sm inline-block border-[2px] border-current px-xs py-base text-label-md uppercase">{sub}</div>
    </div>
  );
}
function ActBtn({ children, onClick, busy, primary }: { children: React.ReactNode; onClick: () => void; busy: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy}
      className={`border-[3px] border-on-surface text-label-md uppercase tracking-widest px-sm py-xs neobrutalist-btn disabled:opacity-50 ${primary ? "bg-primary-container text-on-primary" : "bg-surface"}`}>
      {children}
    </button>
  );
}
