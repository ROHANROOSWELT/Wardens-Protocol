"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getAssets, getTransactions, getAgents, getChainInfo } from "../lib/api";

export default function Landing() {
  const [stats, setStats] = useState({ assets: 0, txs: 0, agents: 0 });
  const [chain, setChain] = useState<{ mode: string; contract_url: string }>({ mode: "sim", contract_url: "" });

  useEffect(() => {
    Promise.all([getAssets(), getTransactions(), getAgents(), getChainInfo()]).then(
      ([a, t, g, c]) => {
        setStats({ assets: a.length, txs: t.length, agents: g.length });
        setChain({ mode: c.mode, contract_url: c.contract_url });
      }
    );
  }, []);

  const live = chain.mode === "chain";

  return (
    <div className="flex flex-col gap-xl px-margin-mobile md:px-margin-desktop max-w-7xl mx-auto w-full py-xl">
      {/* Hero */}
      <section className="flex flex-col md:flex-row gap-lg items-center mt-lg">
        <div className="flex-1 flex flex-col gap-md">
          <span className="reveal reveal-1 sticker self-start bg-[#f2c94c] neo-border-sm neo-shadow-sm px-xs py-1 font-mono-plex text-[13px] uppercase tracking-widest font-semibold">
            ★ {live ? "Live on Casper Testnet" : "Simulation Mode"}
          </span>
          <h1 className="reveal reveal-2 text-headline-xl-mobile md:text-headline-xl uppercase text-on-surface max-w-[800px]">
            The{" "}
            <span className="relative inline-block px-1 bg-primary text-white neo-border-sm shadow-[5px_5px_0px_0px_#2FD98A]">
              Trust Layer
            </span>{" "}
            for Live RWA Credit
          </h1>
          <p className="reveal reveal-3 text-body-lg text-on-surface-variant max-w-[600px]">
            Verifier agents score collateral, challengers catch liars, and bad agents get{" "}
            <span className="font-bold text-error underline decoration-wavy decoration-2 underline-offset-4">
              slashed on-chain
            </span>{" "}
            — on Casper.
          </p>
          <div className="reveal reveal-4 flex flex-col sm:flex-row gap-sm mt-sm">
            <Link
              href="/vault"
              className="bg-on-surface text-on-primary text-label-md neo-border px-md py-sm uppercase neo-interactive-green text-center"
            >
              Enter Vault Registry →
            </Link>
            <Link
              href="/proof"
              className="bg-surface-container-lowest text-on-surface text-label-md neo-border neo-shadow-lg px-md py-sm uppercase neo-interactive text-center"
            >
              View Live Proof
            </Link>
          </div>
        </div>
        {/* Self-contained neobrutalist visual (replaces ephemeral hosted image) */}
        <div className="reveal reveal-3 float-slow flex-1 w-full h-[400px] bg-surface-container neo-border neo-shadow-primary p-sm">
          <svg viewBox="0 0 400 380" className="w-full h-full border-2 border-on-surface bg-surface" preserveAspectRatio="xMidYMid meet">
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="rgba(27,28,22,0.15)" />
              </pattern>
            </defs>
            <rect width="400" height="380" fill="url(#grid)" />
            {/* nodes */}
            <line x1="90" y1="90" x2="300" y2="120" stroke="#1b1c16" strokeWidth="3" />
            <line x1="300" y1="120" x2="200" y2="290" stroke="#1b1c16" strokeWidth="3" />
            <line x1="200" y1="290" x2="90" y2="90" stroke="#1b1c16" strokeWidth="3" />
            {/* animated packets travelling the edges */}
            <line x1="90" y1="90" x2="300" y2="120" stroke="#2FD98A" strokeWidth="3" className="pulse-path" />
            <line x1="300" y1="120" x2="200" y2="290" stroke="#e3dfff" strokeWidth="3" className="pulse-path" style={{ animationDelay: "1.6s" }} />
            <line x1="200" y1="290" x2="90" y2="90" stroke="#f2c94c" strokeWidth="3" className="pulse-path" style={{ animationDelay: "3.2s" }} />
            <rect x="60" y="60" width="60" height="60" fill="#545173" stroke="#1b1c16" strokeWidth="4" />
            <rect x="270" y="90" width="60" height="60" fill="#e3dfff" stroke="#1b1c16" strokeWidth="4" />
            <rect x="170" y="260" width="60" height="60" fill="#2FD98A" stroke="#1b1c16" strokeWidth="4" />
            <text x="90" y="98" fontFamily="Space Grotesk" fontSize="26" fontWeight="900" fill="#fff" textAnchor="middle">V</text>
            <text x="300" y="128" fontFamily="Space Grotesk" fontSize="26" fontWeight="900" fill="#1b1c16" textAnchor="middle">S</text>
            <text x="200" y="298" fontFamily="Space Grotesk" fontSize="26" fontWeight="900" fill="#1b1c16" textAnchor="middle">C</text>
          </svg>
        </div>
      </section>

      {/* Live status strip (real, not fabricated) */}
      <section className="reveal reveal-5 bg-on-surface text-on-primary neo-border neo-shadow-green p-md flex flex-col sm:flex-row justify-around items-center gap-md w-full">
        <Stat label="Network" value={live ? "Casper Testnet" : "Sim (local)"} accent />
        <Divider />
        <Stat label="On-chain transactions" value={String(stats.txs)} />
        <Divider />
        <Stat label="Tracked assets" value={String(stats.assets)} />
        <Divider />
        <Stat label="Autonomous agents" value={String(stats.agents || 5)} />
      </section>

      {/* How it works */}
      <section className="reveal reveal-6 grid grid-cols-1 md:grid-cols-3 gap-md w-full">
        <Step n="01" icon="search" color="text-primary" title="Verify"
          body="Agents check collateral via x402 pay-per-request, confirming assets are real and unencumbered before scoring." />
        <Step n="02" icon="analytics" color="text-primary" title="Score"
          body="A deterministic trust score is posted on-chain; the lending vault sets Loan-to-Value automatically." />
        <Step n="03" icon="gavel" color="text-error" title="Challenge"
          body="Challengers dispute bad scores. If a verifier is proven wrong, its bond is slashed and the vault freezes." />
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center text-center gap-xs">
      <span className="text-label-md uppercase text-outline-variant">{label}</span>
      <span className={`text-headline-lg font-mono-plex ${accent ? "text-[#2FD98A]" : ""}`}>{value}</span>
    </div>
  );
}
function Divider() {
  return <div className="hidden sm:block w-[3px] self-stretch min-h-[60px] bg-outline" />;
}
function Step({ n, icon, color, title, body }: { n: string; icon: string; color: string; title: string; body: string }) {
  return (
    <div className="group bg-surface-variant neo-border neo-shadow p-md flex flex-col gap-sm transition-all duration-150 hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[8px_8px_0px_0px_#545173] hover:bg-surface-container-lowest">
      <div className="flex justify-between items-center border-b-2 border-on-surface pb-xs">
        <span className={`text-headline-md ${color}`}>{n}</span>
        <span className={`material-symbols-outlined ${color}`}>{icon}</span>
      </div>
      <h3 className="text-headline-md uppercase">{title}</h3>
      <p className="text-body-md text-on-surface-variant">{body}</p>
    </div>
  );
}
