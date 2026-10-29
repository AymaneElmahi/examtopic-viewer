#!/usr/bin/env bash
cd "$(dirname "$0")"

PORT=7654

if [ ! -d .venv ]; then
  echo "Creating virtual environment…"
  python3 -m venv .venv
fi

source .venv/bin/activate
pip3 install -q -r requirements.txt

pid=$(lsof -ti tcp:$PORT 2>/dev/null)
if [ -n "$pid" ]; then
  echo "Stopping existing process on :$PORT…"
  kill -9 "$pid" 2>/dev/null
  sleep 0.5
fi

rm -rf __pycache__

echo "→ http://localhost:$PORT"
python3 server.py
