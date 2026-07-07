"use client";
import { useEffect, useMemo, useState } from "react";
import { getTransactions, getChainInfo, explorerLink } from "../../lib/api";

const FILTERS: Record<string, (a: string) => boolean> = {
  ALL: () => true,
  VERIFICATIONS: (a) => a === "submit_score",
  CHALLENGES: (a) => a === "open_challenge" || a === "resolve_challenge",
  SLASHES: (a) => a === "agent_slashed" || a === "freeze_asset",
};

export default function ProofLedger() {
  const [txs, setTxs] = useState<any[]>([]);
  const [chain, setChain] = useState<{ mode: string; contract: string; contract_url: string }>({ mode: "sim", contract: "", contract_url: "" });
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    const load = () => Promise.all([getTransactions(), getChainInfo()]).then(([t, c]) => { setTxs(t); setChain(c); });
    load(); const i = setInterval(load, 3000); return () => clearInterval(i);
  }, []);

  const rows = useMemo(() => txs.slice().reverse().filter((t) => FILTERS[filter](t.action)), [txs, filter]);
  const contractShort = chain.contract ? chain.contract.replace("contract-package-", "").slice(0, 10) + "…" : "sim (local)";

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-lg max-w-[1440px] mx-auto w-full">
      <header className="mb-lg border-b-[4px] border-on-surface pb-6">
        <h1 className="text-headline-lg md:text-headline-xl uppercase mb-2">Proof Ledger</h1>
        <p className="text-body-lg text-on-surface-variant max-w-3xl border-l-[4px] border-primary pl-4 py-1">
          Every on-chain action taken by Wardens Protocol {chain.mode === "chain" ? "on Casper Testnet" : "(local sim)"}. Nothing here is fabricated.
        </p>
      </header>

      {/* Summary */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-md mb-xl">
        <div className="neo-border neo-shadow bg-surface p-md">
          <div className="text-label-md text-on-surface-variant uppercase mb-2 flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">receipt_long</span> Contract</div>
          <div className="text-headline-md font-mono-plex break-all">
            {chain.contract_url ? <a href={chain.contract_url} target="_blank" rel="noreferrer" className="underline hover:text-primary">{contractShort}</a> : contractShort}
          </div>
        </div>
        <div className="neo-border neo-shadow bg-primary-container text-on-primary p-md">
          <div className="text-label-md uppercase mb-2 flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">database</span> Total Transactions</div>
          <div className="text-headline-xl">{txs.length}</div>
        </div>
        <div className="neo-border neo-shadow bg-surface p-md">
          <div className="text-label-md text-on-surface-variant uppercase mb-2 flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">update</span> Mode</div>
          <div className="text-headline-md flex items-center gap-3">
            <span className="relative flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-primary border-2 border-on-surface" />
            </span>
            {chain.mode === "chain" ? "Live · Testnet" : "Sim"}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="flex flex-wrap gap-3 mb-md border-[3px] border-on-surface bg-surface-container-low p-4">
        {Object.keys(FILTERS).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-label-md uppercase tracking-widest px-md py-xs border-[3px] border-on-surface neobrutalist-btn ${filter === f ? "bg-on-surface text-surface" : "bg-surface"}`}>
            {f}
          </button>
        ))}
      </section>

      {/* Table */}
      <section className="border-[3px] border-on-surface bg-surface overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[720px] font-mono-plex">
          <thead>
            <tr className="bg-on-surface text-surface text-label-md uppercase tracking-widest">
              <th className="p-sm">Action</th><th className="p-sm">Result</th><th className="p-sm">Transaction Hash</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={3} className="p-md text-on-surface-variant">No transactions in this category yet.</td></tr>}
            {rows.map((t, i) => (
              <tr key={i} className="border-b-2 border-on-surface hover:bg-primary-fixed transition-colors">
                <td className="p-sm font-bold uppercase">{t.action}</td>
                <td className="p-sm text-on-surface-variant">{t.result}</td>
                <td className="p-sm">
                  <a href={explorerLink(t.deploy_hash)} target="_blank" rel="noreferrer" className="text-primary underline break-all">{t.deploy_hash.slice(0, 20)}… →</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
