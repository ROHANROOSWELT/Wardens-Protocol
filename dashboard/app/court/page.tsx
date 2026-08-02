"use client";
import { useCallback, useEffect, useState } from "react";
import { getChallenges, post } from "../../lib/api";

export default function ChallengeCourt() {
  const [challenges, setChallenges] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(() => { getChallenges().then(setChallenges); }, []);
  useEffect(() => { refresh(); const i = setInterval(refresh, 3000); return () => clearInterval(i); }, [refresh]);

  const open = challenges.filter((c) => c.status === "Open");
  const ledger = challenges.filter((c) => c.status !== "Open");
  const bondAtRisk = open.reduce((s, c) => s + (c.counter_bond ?? 0), 0);

  const resolve = async (id: number, upheld: boolean) => {
    setBusy(true);
    setResolvingId(id);
    setMsg(`Processing transaction on Casper testnet... Please wait ~30-60 seconds for block inclusion.`);
    const r = await post("/api/challenge/resolve", { challenge_id: id, upheld });
    setMsg(r.ok ? `Challenge #${id} ${upheld ? "UPHELD" : "REJECTED"}. Transaction confirmed on-chain and moved to Justice Ledger.` : `Error: ${r.data.error}`);
    setResolvingId(null);
    refresh(); setBusy(false);
  };

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-xl max-w-[1440px] mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-gutter">
      {/* Header */}
      <div className="md:col-span-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-md">
        <div>
          <h1 className="text-headline-lg md:text-headline-xl mb-xs uppercase tracking-tighter">Challenge Court</h1>
          <p className="text-body-lg text-on-surface-variant">Resolve disputes, review evidence, and distribute slashing penalties.</p>
        </div>
        <div className="flex gap-md text-right font-mono-plex">
          <div>
            <div className="text-label-md text-on-surface-variant uppercase">Active Disputes</div>
            <div className="text-headline-md font-bold text-error">{String(open.length).padStart(2, "0")}</div>
          </div>
          <div className="w-[3px] bg-on-surface" />
          <div>
            <div className="text-label-md text-on-surface-variant uppercase">Bond At Risk</div>
            <div className="text-headline-md font-bold text-primary-container">{bondAtRisk} CSPR</div>
          </div>
        </div>
      </div>

      {msg && <div className="md:col-span-12 neo-border bg-primary-fixed p-sm font-mono-plex text-body-md">{msg}</div>}

      {/* Active disputes */}
      <div className="md:col-span-8 flex flex-col gap-lg">
        <h2 className="text-headline-md uppercase border-b-[4px] border-on-surface pb-xs">Active Disputes</h2>
        {open.length === 0 && <div className="neo-border bg-surface p-md text-on-surface-variant italic">No active disputes. The court is quiet.</div>}
        {open.map((c) => {
          const isResolving = resolvingId === c.challenge_id;
          return (
          <div key={c.challenge_id} className={`neo-border neo-shadow bg-surface p-md flex flex-col gap-md ${isResolving ? 'opacity-70' : ''}`}>
            <div className="flex items-center gap-sm">
              {isResolving ? (
                <div className="bg-surface-variant text-on-surface px-xs py-base text-label-md uppercase border-2 border-on-surface">Processing...</div>
              ) : (
                <div className="bg-error text-on-error px-xs py-base text-label-md uppercase border-2 border-on-surface">Open</div>
              )}
              <div className="font-mono-plex font-bold">CHALLENGE #{c.challenge_id} · {c.asset_id}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
              <div className="neo-border-sm bg-surface-container p-sm">
                <div className="flex justify-between items-center mb-xs">
                  <h3 className="text-label-md uppercase tracking-widest text-on-surface-variant">Verifier</h3>
                  <span className="material-symbols-outlined text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>memory</span>
                </div>
                <div className="font-bold">{c.challenged_agent_id}</div>
                <div className="font-mono-plex text-body-md text-on-surface-variant">Posted a trust score now disputed.</div>
              </div>
              <div className="neo-border-sm bg-error-container p-sm">
                <div className="flex justify-between items-center mb-xs">
                  <h3 className="text-label-md uppercase tracking-widest text-on-error-container">Challenger</h3>
                  <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                </div>
                <div className="font-bold">{c.challenger_agent_id}</div>
                <div className="font-mono-plex text-body-md text-on-error-container">Counter-bond {c.counter_bond} CSPR posted.</div>
              </div>
            </div>
            <div className="flex gap-sm">
              <button disabled={busy} onClick={() => resolve(c.challenge_id, true)} className="border-[3px] border-on-surface bg-error text-on-error text-label-md uppercase tracking-widest px-md py-xs neobrutalist-btn disabled:opacity-50">
                {isResolving ? "Slashing..." : "Uphold + Slash"}
              </button>
              <button disabled={busy} onClick={() => resolve(c.challenge_id, false)} className="border-[3px] border-on-surface bg-surface text-label-md uppercase tracking-widest px-md py-xs neobrutalist-btn disabled:opacity-50">
                {isResolving ? "Processing..." : "Reject"}
              </button>
            </div>
          </div>
        )})}
      </div>

      {/* Justice ledger */}
      <div className="md:col-span-4 flex flex-col gap-md">
        <h2 className="text-headline-md uppercase border-b-[4px] border-on-surface pb-xs">Justice Ledger</h2>
        {ledger.length === 0 && <div className="neo-border bg-surface p-sm text-on-surface-variant italic">No resolved cases yet.</div>}
        {ledger.map((c) => (
          <div key={c.challenge_id} className="neo-border-sm bg-surface p-sm flex justify-between items-center">
            <div className="font-mono-plex text-label-md">#{c.challenge_id} · {c.asset_id}</div>
            <span className="text-label-md font-bold uppercase px-2 py-1 border-2 border-on-surface" style={{ background: c.status === "Upheld" ? "#ba1a1a" : "#f5a623", color: "#fff" }}>{c.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
