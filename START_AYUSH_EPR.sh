#!/usr/bin/env bash
# Runs the Express API (:4000) and the Next.js frontend (:3000) together, without Docker.
set -e
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

if [ ! -f .env ]; then
  cp .env.example .env
fi

[ -d node_modules ] && [ -d server/node_modules ] && [ -d web/node_modules ] || npm run install:all
[ -d web/.next ] || npm run build

echo "======================================================"
echo " Starting AYUSH Central EPR..."
echo " Open http://localhost:3000"
echo "======================================================"

npm start
