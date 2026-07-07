// Registry Agent (Section 7.3). Checks issuer/debtor against the mock company
// registry. Deterministic — no LLM.
import { serveVerifier, loadJson, type VerifyResult } from "../../common.ts";

interface RegistryRow {
  company: string;
  valid: boolean;
  risk_flag: boolean;
}

const registry = await loadJson<RegistryRow[]>("../backend/src/data/registry.json");

function lookup(name?: string): RegistryRow | undefined {
  return registry.find((r) => r.company === name);
}

function verify(body: { issuer?: string; debtor?: string }): VerifyResult {
  const findings: string[] = [];
  let valid = true;
  const issuer = lookup(body.issuer);
  const debtor = lookup(body.debtor);

  if (issuer?.valid) findings.push("Issuer exists in registry");
  else {
    findings.push("Issuer missing or invalid in registry");
    valid = false;
  }
  if (debtor?.valid) findings.push("Debtor exists in registry");
  else {
    findings.push("Debtor missing or invalid in registry");
    valid = false;
  }
  if (issuer?.risk_flag || debtor?.risk_flag) {
    findings.push("Blacklist / risk flag present");
    valid = false;
  } else {
    findings.push("No blacklist flag");
  }

  const score = valid ? 90 : 20;
  return { agent: "registry-agent", valid, score, findings };
}

serveVerifier({
  port: Number(process.env.PORT ?? 4103),
  path: "/verify/registry",
  agent: process.env.AGENT_ID ?? "registry-agent-1",
  wallet: process.env.AGENT_WALLET ?? "casper-registry-agent-wallet",
  price: process.env.VERIFICATION_PRICE ?? "1000000",
  verify,
});
