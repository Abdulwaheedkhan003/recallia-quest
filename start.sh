#!/usr/bin/env bash
# Recallia Quest - one-click start for macOS/Linux. Opens http://localhost:8787 in the browser.
set -e
cd "$(dirname "$0")"
node scripts/preflight-node.mjs
[ -d node_modules ] || npm install
npm run build
( sleep 4; (google-chrome http://localhost:8787 || open -a "Google Chrome" http://localhost:8787 || xdg-open http://localhost:8787) >/dev/null 2>&1 ) &
npm start
