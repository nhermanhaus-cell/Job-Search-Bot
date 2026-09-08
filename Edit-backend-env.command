#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/backend"
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created backend/.env from .env.example"
fi
open -e .env
echo "Opened backend/.env in TextEdit. After saving, restart npm run dev."
echo "Press Return to close this window."
read -r
