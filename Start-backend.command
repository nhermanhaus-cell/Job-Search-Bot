#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$PWD"

need() {
  echo ""
  echo "$1"
  echo ""
  echo "Press Return to close this window."
  read -r
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  need "Install Node.js 20+ from https://nodejs.org (LTS), then run Start-backend.command again."
fi

start_postgres() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "Starting Postgres with Docker…"
    if docker compose up -d postgres; then
      echo "Waiting for Postgres…"
      for _ in {1..40}; do
        if docker compose exec -T postgres pg_isready -U jobhunt -d jobhunt >/dev/null 2>&1; then
          return 0
        fi
        sleep 1
      done
      need "Postgres container started but never became ready. Check Docker Desktop."
    fi
    echo "Docker could not bind port 5432; trying whatever Postgres is already on this Mac…"
  fi

  if command -v pg_isready >/dev/null 2>&1 && pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    echo "Using the Postgres server already listening on localhost:5432."
    if command -v createdb >/dev/null 2>&1; then
      createdb jobhunt >/dev/null 2>&1 || true
    fi
    return 0
  fi

  need "Postgres is required. Easiest path: install Docker Desktop, open it, then run this command again.
Or: brew install postgresql@16 && brew services start postgresql@16"
}

start_postgres

cd "$ROOT/backend"
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Wrote backend/.env from .env.example"
fi

echo "Installing API packages…"
npm install
npx prisma generate
npx prisma migrate deploy

echo ""
echo "API starting at http://localhost:3000"
echo "Leave this window open, go back to the Mac app, tap Continue without an account."
echo ""
npm run dev
