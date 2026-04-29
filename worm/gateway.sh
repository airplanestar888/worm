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

echo "[start] Running: node server/worm.js"
echo

node server/worm.js

echo
echo "============================================================"
echo " [Worm stopped]"
echo "============================================================"
