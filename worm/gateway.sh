#!/usr/bin/env bash

PORT="${PORT:-3842}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "============================================================"
echo " Worm Gateway  |  Port $PORT"
echo " Ctrl+C to stop"
echo "============================================================"
echo

# Install deps if missing
if [ ! -d node_modules ]; then
  echo "[setup] Installing dependencies..."
  npm install
  echo
fi

# Kill any existing process occupying the port
OLD_PID=$(lsof -ti tcp:"$PORT" 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
  echo "[info] Killing old process on port $PORT (PID $OLD_PID)..."
  kill -9 "$OLD_PID" 2>/dev/null || true
  sleep 1
fi

# Forced shutdown can leave the Telegram polling lock behind.
# Remove it only when the recorded PID is no longer alive.
if [ -f data/telegram-bot.lock ]; then
  LOCK_PID="$(cat data/telegram-bot.lock 2>/dev/null || true)"
  if [ -z "$LOCK_PID" ] || ! kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[info] Removing stale Telegram polling lock (PID ${LOCK_PID:-unknown})."
    rm -f data/telegram-bot.lock
  fi
fi

echo "[start] Running: node server/worm.js"
echo

node server/worm.js

echo
echo "============================================================"
echo " [Worm stopped]"
echo "============================================================"
