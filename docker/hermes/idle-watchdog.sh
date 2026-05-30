#!/usr/bin/env bash
# ── Idle watchdog ─────────────────────────────────────────────────────────────
# Frees server RAM by stopping the container after a period of no activity.
# "Activity" = the heartbeat file being touched. The brain connector / gateway
# touches it on every request; the web app also touches it when it proxies a
# message. If the file goes stale beyond IDLE_STOP_MINUTES, we exit (PID-1 dies
# via tini → container stops). The control plane then marks status=stopped.
set -euo pipefail

IDLE_STOP_MINUTES="${IDLE_STOP_MINUTES:-10}"
HEARTBEAT="${HEARTBEAT_FILE:-$HOME/.secondbrain/heartbeat}"
CHECK_INTERVAL_SECONDS="${CHECK_INTERVAL_SECONDS:-30}"

mkdir -p "$(dirname "$HEARTBEAT")"
touch "$HEARTBEAT"

idle_limit=$(( IDLE_STOP_MINUTES * 60 ))
echo "[watchdog] idle-stop after ${IDLE_STOP_MINUTES}m (${idle_limit}s)"

while true; do
  sleep "$CHECK_INTERVAL_SECONDS"
  now=$(date +%s)
  last=$(stat -c %Y "$HEARTBEAT" 2>/dev/null || stat -f %m "$HEARTBEAT" 2>/dev/null || echo "$now")
  idle=$(( now - last ))
  if [ "$idle" -ge "$idle_limit" ]; then
    echo "[watchdog] idle ${idle}s ≥ ${idle_limit}s — stopping agent to free RAM"
    # Kill the main hermes process so PID-1 (tini) exits and the container stops.
    pkill -TERM -f "hermes" 2>/dev/null || true
    sleep 3
    exit 0
  fi
done
