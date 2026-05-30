#!/usr/bin/env bash
# ── Hermes agent container entrypoint ─────────────────────────────────────────
# Configures Hermes for THIS user from injected env, registers the SecondBrain
# brain connector as a tool, starts the idle watchdog, then runs the agent loop.
#
# Required env (injected by the provisioner at `docker run`):
#   SECONDBRAIN_USER_ID   - Clerk user id (for labels/logs only)
#   SECONDBRAIN_API_BASE  - base URL of the SecondBrain agent API
#   SECONDBRAIN_TOKEN     - scoped Bearer token (Bearer sb_...)
#   LLM_PROVIDER          - e.g. openrouter | anthropic | openai
#   LLM_MODEL             - model id
#   LLM_API_KEY           - the user's BYO key (never persisted server-side)
#   IDLE_STOP_MINUTES     - auto-stop after this many minutes idle (default 10)
set -euo pipefail

: "${SECONDBRAIN_API_BASE:?missing SECONDBRAIN_API_BASE}"
: "${SECONDBRAIN_TOKEN:?missing SECONDBRAIN_TOKEN}"
: "${LLM_PROVIDER:?missing LLM_PROVIDER}"
: "${LLM_MODEL:?missing LLM_MODEL}"
: "${LLM_API_KEY:?missing LLM_API_KEY}"
IDLE_STOP_MINUTES="${IDLE_STOP_MINUTES:-10}"

echo "[secondbrain] booting agent for user=${SECONDBRAIN_USER_ID:-unknown}"

# Write the brain connector config the connector script reads.
mkdir -p "$HOME/.secondbrain"
cat > "$HOME/.secondbrain/config.json" <<JSON
{
  "apiBase": "${SECONDBRAIN_API_BASE}",
  "token": "${SECONDBRAIN_TOKEN}",
  "manifestUrl": "${SECONDBRAIN_API_BASE}/api/agent/manifest"
}
JSON
chmod 600 "$HOME/.secondbrain/config.json"

# Configure Hermes provider/model from BYO env (best-effort; non-fatal in beta).
if command -v hermes >/dev/null 2>&1; then
  hermes config set provider "$LLM_PROVIDER" 2>/dev/null || true
  hermes config set model "$LLM_MODEL" 2>/dev/null || true
  hermes config set api_key "$LLM_API_KEY" 2>/dev/null || true
  # Register the SecondBrain brain as an MCP/tool source if supported.
  hermes mcp add secondbrain --url "${SECONDBRAIN_API_BASE}/api/agent/manifest" \
      --header "Authorization: Bearer ${SECONDBRAIN_TOKEN}" 2>/dev/null || true
fi

# Start the idle watchdog in the background — it touches a heartbeat file and
# exits the container after IDLE_STOP_MINUTES with no activity, freeing RAM.
IDLE_STOP_MINUTES="$IDLE_STOP_MINUTES" bash "$HOME/idle-watchdog.sh" &

# Hand off to the agent loop. In beta we run the gateway so the web app can
# proxy chat to it; falls back to keeping the container alive if hermes is absent.
if command -v hermes >/dev/null 2>&1; then
  exec hermes gateway start
else
  echo "[secondbrain] hermes not found in image — holding container open for debug"
  exec tail -f /dev/null
fi
