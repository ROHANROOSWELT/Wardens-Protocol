"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getAssets, getTransactions, getAgents, ltvForScore, post, explorerLink } from "../../lib/api";

function badge(status: string) {
  if (status === "Healthy" || status === "Active") return { bg: "#b4d3b2", fg: "#1e3b1b", label: status.toUpperCase() };
  if (status === "Watchlist") return { bg: "#e8c07e", fg: "#4d3600", label: "REVIEW" };
  return { bg: "#ffdad6", fg: "#93000a", label: status.toUpperCase() };
}

export default function VaultRegistry() {
  const [assets, setAssets] = useState<any[]>([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ issuer: "", debtor: "", faceValue: "", dueDate: "", invoiceNumber: "", invoiceFile: "" });
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState<{ id: string, hash: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = () => Promise.all([getAssets(), getTransactions(), getAgents()]).then(([a, t, g]) => { setAssets(a); setTxs(t); setAgents(g); });
    load(); const i = setInterval(load, 3000); return () => clearInterval(i);
  }, []);

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setSuccessMsg(null);
    const { issuer, debtor, faceValue, dueDate, invoiceNumber, invoiceFile } = formData;
    if (!issuer || !debtor || !faceValue || !dueDate || !invoiceNumber) {
      return setFormError("Issuer, Debtor, Face Value, Due Date, and Invoice Number are required.");
    }
    const fv = Number(faceValue);
    if (isNaN(fv) || fv <= 0) return setFormError("Face value must be > 0.");
    if (new Date(dueDate).getTime() <= Date.now()) return setFormError("Due date must be in the future.");

    setBusy(true);
    try {
      const res = await post("/api/assets", { issuer, debtor, faceValue: fv, dueDate, invoice_number: invoiceNumber, invoice_file_content: invoiceFile });
      if (!res.ok) {
        setFormError(res.data?.error || "Failed to create asset.");
      } else {
        setShowForm(false);
        setFormData({ issuer: "", debtor: "", faceValue: "", dueDate: "", invoiceNumber: "", invoiceFile: "" });
        const [a, t, g] = await Promise.all([getAssets(), getTransactions(), getAgents()]);
        setAssets(a); setTxs(t); setAgents(g);
        setSuccessMsg({ id: res.data.asset_id, hash: res.data.deploy_hash });
      }
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const frozen = assets.filter((a) => a.status === "Frozen").length;
  const healthPct = assets.length ? Math.round(((assets.length - frozen) / assets.length) * 100) : 100;

  return (
    <div className="w-full px-margin-mobile md:px-margin-desktop py-xl">
      <div className="mb-lg">
        <h1 className="text-headline-lg md:text-headline-xl mb-base uppercase">Vault Registry</h1>
        <p className="text-body-lg text-on-surface-variant max-w-2xl border-l-[4px] border-primary-container pl-sm py-xs">
          Real-World Asset credit positions monitored and enforced by Wardens Protocol. Immutable, transparent, brutal.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
        {/* Vault list */}
        <div className="md:col-span-8 flex flex-col gap-sm">
          {assets.length === 0 && (
            <div className="neo-border bg-surface p-md text-on-surface-variant">No assets yet — register one using the panel.</div>
          )}
          {assets.map((a) => {
            const b = badge(a.status);
            const ltv = a.status === "Frozen" ? 0 : ltvForScore(a.current_score);
            return (
              <Link key={a.asset_id} href={`/asset/${a.asset_id}`}
                className="neo-border bg-surface p-md neo-shadow-sm neobrutalist-btn flex flex-col sm:flex-row justify-between items-start sm:items-center gap-md">
                <div className="flex items-center gap-sm">
                  <div className="w-16 h-16 neo-border shrink-0 flex items-center justify-center text-headline-md font-black" style={{ background: b.bg, color: b.fg }}>
                    {a.asset_id.replace(/[^0-9]/g, "").slice(0, 3) || "INV"}
                  </div>
                  <div>
                    <h3 className="text-headline-md leading-none mb-xs">{a.asset_id}</h3>
                    <p className="text-label-md text-on-surface-variant tracking-widest uppercase font-mono-plex">{a.issuer} → {a.debtor}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-md w-full sm:w-auto">
                  <Metric label="Score" value={String(a.current_score)} />
                  <Metric label="LTV" value={`${ltv}%`} accent />
                  <Metric label="Face" value={`${a.face_value}`} />
                </div>
                <span className="neo-border-sm text-label-md uppercase px-sm py-xs inline-flex items-center gap-xs shrink-0" style={{ background: b.bg, color: b.fg }}>
                  <span className="w-2 h-2" style={{ background: b.fg }} /> {b.label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Side panel */}
        <div className="md:col-span-4 flex flex-col gap-lg">
          {successMsg && (
            <div className="neo-border bg-primary-container text-on-primary p-md neo-shadow animate-in fade-in">
              <p className="text-body-lg font-bold mb-xs">Successfully registered {successMsg.id}!</p>
              <a href={explorerLink(successMsg.hash)} target="_blank" rel="noreferrer" className="underline text-label-md">View on Casper Explorer →</a>
            </div>
          )}

          <button onClick={() => setShowForm(!showForm)} className="bg-primary-container text-on-primary neo-border neo-shadow p-md neobrutalist-btn text-center w-full">
            <span className="text-headline-md uppercase tracking-wide">{showForm ? "Cancel" : "Register New Asset"}</span>
          </button>
          
          {showForm && (
            <div className="neo-border bg-surface neo-shadow p-md animate-in fade-in slide-in-from-top-4">
              <h2 className="text-label-md uppercase tracking-widest mb-md border-b-[4px] border-on-surface pb-xs">New Asset</h2>
              <form onSubmit={submitForm} className="flex flex-col gap-sm">
                <div>
                  <label className="text-label-md uppercase mb-xs block">Invoice Number</label>
                  <input type="text" className="w-full neo-border-sm p-xs text-body-md" required placeholder="INV-12345"
                    value={formData.invoiceNumber} onChange={(e) => setFormData({...formData, invoiceNumber: e.target.value})} />
                </div>
                <div>
                  <label className="text-label-md uppercase mb-xs block">Issuer</label>
                  <input type="text" className="w-full neo-border-sm p-xs text-body-md" required placeholder="ABC Corp"
                    value={formData.issuer} onChange={(e) => setFormData({...formData, issuer: e.target.value})} />
                </div>
                <div>
                  <label className="text-label-md uppercase mb-xs block">Debtor</label>
                  <input type="text" className="w-full neo-border-sm p-xs text-body-md" required placeholder="XYZ Ltd"
                    value={formData.debtor} onChange={(e) => setFormData({...formData, debtor: e.target.value})} />
                </div>
                <div>
                  <label className="text-label-md uppercase mb-xs block">Face Value ($)</label>
                  <input type="number" min="1" step="any" className="w-full neo-border-sm p-xs text-body-md" required placeholder="1000"
                    value={formData.faceValue} onChange={(e) => setFormData({...formData, faceValue: e.target.value})} />
                </div>
                <div>
                  <label className="text-label-md uppercase mb-xs block">Due Date</label>
                  <input type="date" className="w-full neo-border-sm p-xs text-body-md" required
                    value={formData.dueDate} onChange={(e) => setFormData({...formData, dueDate: e.target.value})} />
                </div>
                <div>
                  <label className="text-label-md uppercase mb-xs block">Invoice Document (Optional JSON)</label>
                  <input type="file" accept=".json" className="w-full neo-border-sm p-xs text-body-md"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => setFormData({...formData, invoiceFile: e.target?.result as string});
                        reader.readAsText(file);
                      }
                    }} />
                </div>
                {formError && <div className="text-error text-label-md uppercase bg-error/10 p-xs neo-border-sm border-error">{formError}</div>}
                <button type="submit" disabled={busy} className="bg-on-surface text-surface neo-border neobrutalist-btn p-xs uppercase text-label-md mt-xs disabled:opacity-50">
                  {busy ? "Registering..." : "Register Asset"}
                </button>
              </form>
            </div>
          )}

          <div className="neo-border bg-surface neo-shadow">
            <div className="p-md border-b-[4px] border-on-surface">
              <h2 className="text-label-md uppercase tracking-widest">System Overview</h2>
            </div>
            <div className="p-md flex flex-col gap-md">
              <Big label="Tracked assets" value={String(assets.length)} />
              <hr className="border-t-[4px] border-on-surface" />
              <Big label="On-chain transactions" value={String(txs.length)} />
              <hr className="border-t-[4px] border-on-surface" />
              <Big label="Slashed verifiers" value={String(agents.filter((x) => x.slashed_count > 0).length)} />
              <hr className="border-t-[4px] border-on-surface" />
              <div>
                <div className="flex justify-between items-end mb-xs">
                  <p className="text-label-md text-on-surface-variant uppercase">Network Health</p>
                  <p className="text-body-lg font-bold text-primary-container">{frozen === 0 ? "OPTIMAL" : "DEGRADED"}</p>
                </div>
                <div className="h-8 neo-border-sm bg-surface-container-highest w-full relative">
                  <div className="absolute inset-y-0 left-0 bg-primary-container border-r-[3px] border-on-surface" style={{ width: `${healthPct}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div><p className="text-label-md text-on-surface-variant uppercase">{label}</p><p className={`text-body-lg font-bold ${accent ? "text-primary-container" : ""}`}>{value}</p></div>;
}
function Big({ label, value }: { label: string; value: string }) {
  return <div><p className="text-label-md text-on-surface-variant uppercase mb-xs">{label}</p><p className="text-headline-lg tracking-tighter">{value}</p></div>;
}
