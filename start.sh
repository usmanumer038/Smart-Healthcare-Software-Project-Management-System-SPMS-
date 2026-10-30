#!/usr/bin/env bash
# macOS / Linux launcher
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Install Node.js LTS from https://nodejs.org first."; exit 1; }
[ -d node_modules ] || npm install
[ -f dist/index.html ] || npm run build
( sleep 6; (xdg-open http://localhost:5000 || open http://localhost:5000) >/dev/null 2>&1 ) &
npm start
