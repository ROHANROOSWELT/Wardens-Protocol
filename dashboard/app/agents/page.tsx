"use client";
import { useEffect, useState } from "react";
import { getAgents } from "../../lib/api";

export default function AgentNetwork() {
  const [agents, setAgents] = useState<any[]>([]);
  useEffect(() => {
    const load = () => getAgents().then(setAgents);
    load(); const i = setInterval(load, 3000); return () => clearInterval(i);
  }, []);

  const bonded = agents.reduce((s, a) => s + (a.bonded_amount ?? 0), 0);
  const slashed = agents.filter((a) => a.slashed_count > 0).length;

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-lg max-w-[1440px] mx-auto w-full flex flex-col gap-xl">
      <section>
        <h1 className="text-headline-lg md:text-headline-xl uppercase tracking-tighter">Agent Network</h1>
        <p className="text-body-lg text-on-surface-variant mt-xs">Verifier, aggregator and challenger agents — bonded stake, reputation, and enforcement history.</p>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        <div className="bg-primary-container text-on-primary p-md neo-border neo-shadow flex flex-col justify-between min-h-[150px]">
          <div className="flex justify-between items-start">
            <span className="text-label-md uppercase tracking-widest text-on-primary-container">Total Value Bonded</span>
            <span className="material-symbols-outlined text-[32px]">account_balance_wallet</span>
          </div>
          <div className="text-headline-lg">{bonded} CSPR</div>
        </div>
        <div className="bg-surface-container-highest p-md neo-border neo-shadow flex flex-col justify-between min-h-[150px]">
          <div className="flex justify-between items-start">
            <span className="text-label-md uppercase tracking-widest text-on-surface-variant">Registered Agents</span>
            <span className="material-symbols-outlined text-[32px]">smart_toy</span>
          </div>
          <div className="text-headline-lg">{agents.length}</div>
        </div>
        <div className={`p-md neo-border neo-shadow flex flex-col justify-between min-h-[150px] ${slashed ? "bg-error text-on-error" : "bg-surface-container-highest"}`}>
          <div className="flex justify-between items-start">
            <span className="text-label-md uppercase tracking-widest">Slashed Verifiers</span>
            <span className="material-symbols-outlined text-[32px]">gavel</span>
          </div>
          <div className="text-headline-lg">{slashed}</div>
        </div>
      </section>

      {/* Registry */}
      <section className="neo-border neo-shadow bg-surface">
        <div className="p-md border-b-[4px] border-on-surface">
          <h2 className="text-headline-md uppercase">Agent Registry</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px] font-mono-plex">
            <thead>
              <tr className="bg-on-surface text-surface text-label-md uppercase tracking-widest">
                {["Agent", "Role", "Bond", "Reputation", "Reports", "Status"].map((h) => (
                  <th key={h} className="p-sm">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 && (
                <tr><td colSpan={6} className="p-md text-on-surface-variant">No agents registered yet — run verification from the Control Room.</td></tr>
              )}
              {agents.map((a) => (
                <tr key={a.agent_id} className="border-b-2 border-on-surface hover:bg-primary-fixed transition-colors">
                  <td className="p-sm font-bold">{a.agent_id}</td>
                  <td className="p-sm">{a.role}</td>
                  <td className="p-sm">{a.bonded_amount} CSPR</td>
                  <td className="p-sm">{a.reputation}</td>
                  <td className="p-sm">{a.successful_reports}/{a.total_reports}</td>
                  <td className="p-sm">
                    {a.slashed_count > 0 ? (
                      <span className="bg-error text-on-error px-2 py-1 border-2 border-on-surface uppercase text-label-md">Slashed</span>
                    ) : a.active ? (
                      <span className="px-2 py-1 border-2 border-on-surface uppercase text-label-md" style={{ background: "#b4d3b2", color: "#1e3b1b" }}>Active</span>
                    ) : (
                      <span className="bg-surface-container-highest px-2 py-1 border-2 border-on-surface uppercase text-label-md">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
