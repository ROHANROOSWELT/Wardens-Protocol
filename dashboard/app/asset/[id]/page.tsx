"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getDashboard, explorerLink } from "../../../lib/api";

function color(s: number) { return s >= 75 ? "#2FD98A" : s >= 50 ? "#f5a623" : "#ba1a1a"; }
const AGENT_ICON: Record<string, string> = { "parser-agent": "document_scanner", "fraud-agent": "security", "registry-agent": "account_balance" };

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    const load = () => getDashboard(id).then(setS);
    load(); const i = setInterval(load, 3000); return () => clearInterval(i);
  }, [id]);

  if (!s) return <div className="p-margin-desktop max-w-7xl mx-auto text-body-lg text-on-surface-variant">Loading {id}… (is the backend running on :4000?)</div>;

  const score = s.current_score as number;
  const C = 339.292; // r=54
  const due = s.asset.due_date ? new Date(s.asset.due_date * 1000).toISOString().slice(0, 10) : "—";
  const receipts: any[] = s.receipts ?? [];

  return (
    <div className="px-margin-mobile md:px-margin-desktop py-lg space-y-md max-w-7xl mx-auto w-full">
      <div className="text-label-md uppercase font-mono-plex text-on-surface-variant">
        <Link href="/vault" className="hover:text-primary">VAULTS</Link> / {id}
      </div>

      {/* Identity */}
      <section className="bg-surface-container neo-brutal-heavy p-md flex flex-col md:flex-row justify-between items-start md:items-center gap-md">
        <div>
          <h1 className="text-headline-lg md:text-headline-xl mb-base uppercase">{id}</h1>
          <span className="bg-surface-variant px-2 py-1 neo-border-sm font-mono-plex text-label-md">{s.asset.issuer} → {s.asset.debtor}</span>
        </div>
        <div className="flex flex-wrap gap-md items-end bg-surface p-sm neo-border">
          <Field label="Issuer" value={s.asset.issuer} />
          <Field label="Face Value" value={`${s.asset.face_value} CSPR`} />
          <Field label="Due" value={due} />
          <div className="flex items-center justify-center px-4 py-2 neo-border text-headline-md font-bold uppercase tracking-widest" style={{ background: color(score), color: "#1b1c16" }}>{s.status}</div>
        </div>
      </section>

      {/* Trust + LTV */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-md">
        <section className="md:col-span-5 bg-surface-container-low neo-border p-md flex flex-col sm:flex-row gap-md items-center justify-between">
          <div className="relative w-40 h-40 flex items-center justify-center flex-shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle className="text-surface-variant" cx="60" cy="60" fill="none" r="54" stroke="currentColor" strokeWidth="8" />
              <circle cx="60" cy="60" fill="none" r="54" stroke={color(score)} strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} strokeWidth="8" />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-headline-xl leading-none">{score}</span>
              <span className="text-label-md uppercase tracking-wider">Trust Score</span>
            </div>
          </div>
          <div className="flex flex-col gap-sm w-full">
            <Row label="Current LTV" value={`${s.ltv}%`} />
            <Row label="Borrowed" value={`${s.position?.borrowed_amount ?? 0} CSPR`} />
            <div className="border-2 border-on-surface p-sm flex justify-between items-center shadow-[2px_2px_0px_0px_rgba(27,28,22,1)]" style={{ background: color(score) }}>
              <span className="text-label-md uppercase">Borrowing</span>
              <span className="text-headline-md font-bold">{s.borrowing}</span>
            </div>
          </div>
        </section>

        {/* Verifier agents (x402) */}
        <section className="md:col-span-7 bg-surface-container neo-border p-md flex flex-col gap-sm">
          <h2 className="text-headline-md uppercase border-b-[3px] border-on-surface pb-2 mb-2">Verifier Agents · x402</h2>
          {receipts.length === 0 ? (
            <p className="text-body-lg italic text-on-surface-variant">Not yet verified — run verification from the Control Room.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-sm">
              {receipts.map((r, i) => (
                <div key={i} className="bg-surface border-[3px] border-on-surface shadow-[4px_4px_0px_0px_rgba(27,28,22,1)] p-sm flex flex-col justify-between gap-sm hover:bg-primary-fixed transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>{AGENT_ICON[r.verifier_agent] ?? "smart_toy"}</span>
                    <span className="material-symbols-outlined text-[#2FD98A]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                  </div>
                  <div>
                    <div className="text-body-lg font-bold mb-xs capitalize">{r.verifier_agent.replace("-", " ")}</div>
                    <div className="bg-on-surface text-surface text-label-md font-mono-plex inline-block px-2 py-1 uppercase">x402 PAID · {r.amount} motes</div>
                    <div className="text-label-md font-mono-plex text-on-surface-variant mt-xs truncate">{r.receipt?.slice(0, 22)}…</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {s.explanation && <p className="text-body-md text-on-surface-variant border-t-2 border-on-surface pt-sm mt-sm">{s.explanation}</p>}
        </section>
      </div>

      {/* Challenges + timeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <section className="bg-surface-variant neo-border p-md flex flex-col">
          <div className="flex items-center gap-2 border-b-[3px] border-on-surface pb-2 mb-sm">
            <span className="material-symbols-outlined">gavel</span>
            <h2 className="text-headline-md uppercase">Challenge History</h2>
          </div>
          {(s.challenges ?? []).length === 0 ? (
            <div className="flex-grow flex items-center justify-center bg-surface border-2 border-on-surface p-lg text-center">
              <p className="text-body-lg italic text-on-surface-variant">No challenges filed against this asset.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-xs">
              {s.challenges.map((c: any) => (
                <div key={c.challenge_id} className="border-2 border-on-surface bg-surface p-sm flex justify-between items-center">
                  <span className="font-mono-plex text-label-md">#{c.challenge_id} {c.challenger_agent_id} vs {c.challenged_agent_id}</span>
                  <span className="text-label-md font-bold uppercase px-2 py-1 border-2 border-on-surface" style={{ background: c.status === "Upheld" ? "#ba1a1a" : c.status === "Rejected" ? "#f5a623" : "#2FD98A", color: "#fff" }}>{c.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-surface neo-border p-md">
          <div className="flex items-center gap-2 border-b-[3px] border-on-surface pb-2 mb-sm">
            <span className="material-symbols-outlined">history</span>
            <h2 className="text-headline-md uppercase">Transaction Timeline</h2>
          </div>
          <ul className="font-mono-plex text-label-md flex flex-col border-2 border-on-surface bg-surface-container max-h-[280px] overflow-auto">
            {(s.transactions ?? []).slice().reverse().map((t: any, i: number) => (
              <li key={i} className="p-xs px-sm border-b-2 border-on-surface flex justify-between items-center gap-sm hover:bg-primary-container hover:text-on-primary-container transition-colors group">
                <span className="truncate">{t.action} · {t.result}</span>
                <a className="opacity-60 group-hover:opacity-100 uppercase font-bold underline whitespace-nowrap" href={explorerLink(t.deploy_hash)} target="_blank" rel="noreferrer">EXPLORER →</a>
              </li>
            ))}
            {(s.transactions ?? []).length === 0 && <li className="p-sm text-on-surface-variant">No transactions yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-col"><span className="text-label-md uppercase text-on-surface-variant">{label}</span><span className="text-headline-md">{value}</span></div>;
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border-2 border-on-surface p-sm flex justify-between items-center shadow-[2px_2px_0px_0px_rgba(27,28,22,1)]">
      <span className="text-label-md uppercase text-on-surface-variant">{label}</span>
      <span className="text-headline-md">{value}</span>
    </div>
  );
}
