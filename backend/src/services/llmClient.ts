// Shared LLM client — used by the agents + aggregator to turn their DETERMINISTIC
// findings into a human-readable explanation string. It NEVER decides scores,
// verdicts, or on-chain actions (Section 0 rule 2). Every call has a templated
// fallback and a timeout, so the pipeline is unaffected if the LLM is missing,
// rate-limited, or slow.
//
// Providers (LLM_PROVIDER env):
//   "gemini" (default): Google AI Studio Generative Language API — needs GEMINI_API_KEY.
//   "openai":           any OpenAI-compatible endpoint (e.g. OpenCLAW) — needs LLM_BASE_URL.
//   "off":              always return the fallback (no network).
// With no key configured, it silently behaves like "off" — the demo still works.

const PROVIDER = process.env.LLM_PROVIDER ?? "gemini";
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const OPENAI_BASE = (process.env.LLM_BASE_URL ?? "").replace(/\/$/, "");
const OPENAI_KEY = process.env.LLM_API_KEY ?? "";
const OPENAI_MODEL = process.env.LLM_MODEL ?? "gpt-4o-mini";
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 6000);

const SYSTEM =
  "You are a risk-explanation writer for an on-chain RWA collateral verifier. " +
  "Given deterministic findings, write ONE or TWO short plain-English sentences explaining the result. " +
  "Do not invent facts beyond the findings. No markdown, no preamble, no bullet points.";

export function llmEnabled(): boolean {
  if (PROVIDER === "off") return false;
  if (PROVIDER === "openai") return OPENAI_BASE.length > 0;
  return GEMINI_KEY.length > 0; // gemini (default)
}

/** Provider label for logging/UX ("gemini" | "openai" | "fallback"). */
export function llmProvider(): string {
  return llmEnabled() ? PROVIDER : "fallback";
}

async function fetchJson(url: string, init: RequestInit): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const body = {
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 120 },
  };
  const data = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callOpenAI(prompt: string): Promise<string> {
  const data = await fetchJson(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(OPENAI_KEY ? { Authorization: `Bearer ${OPENAI_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.4,
      max_tokens: 120,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  return data?.choices?.[0]?.message?.content ?? "";
}

/**
 * Turn a prompt into a short explanation. Returns `fallback` on any problem
 * (disabled, timeout, empty, error) — callers can rely on always getting text.
 */
export async function explain(prompt: string, fallback: string): Promise<string> {
  if (!llmEnabled()) return fallback;
  try {
    const raw = PROVIDER === "openai" ? await callOpenAI(prompt) : await callGemini(prompt);
    const text = (raw ?? "").trim().replace(/\s+/g, " ");
    return text.length > 0 ? text : fallback;
  } catch {
    return fallback; // never let the LLM break the flow
  }
}
