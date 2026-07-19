#!/usr/bin/env bash
# Start the three x402 verifier agents + the backend orchestrator locally.
# Dashboard is started separately (cd dashboard && bun run dev).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Installing deps (bun)…"
( cd "$ROOT/backend" && bun install >/dev/null 2>&1 || true )

echo "Starting verifier agents (4101 parser, 4102 fraud, 4103 registry)…"
( cd "$ROOT/agents/parser-agent"   && PORT=4101 bun run src/index.ts ) &
( cd "$ROOT/agents/fraud-agent"    && PORT=4102 bun run src/index.ts ) &
( cd "$ROOT/agents/registry-agent" && PORT=4103 bun run src/index.ts ) &
( cd "$ROOT/agents/insurance-agent" && PORT=4104 bun run src/index.ts ) &
sleep 1

echo "Starting backend orchestrator on :4000 …"
( cd "$ROOT/backend" && PORT=4000 bun run src/index.ts ) &

echo "All services starting. Ctrl-C to stop."
wait
