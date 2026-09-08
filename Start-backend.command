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

node_major() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0
}

ensure_node() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
    nvm install 22 >/dev/null
    nvm use 22
  fi

  if command -v brew >/dev/null 2>&1; then
    local brew_node
    brew_node="$(brew --prefix node 2>/dev/null)/bin"
    if [[ -x "$brew_node/node" ]]; then
      export PATH="$brew_node:$PATH"
    fi
  fi

  if ! command -v node >/dev/null 2>&1 || [[ "$(node_major)" -lt 20 ]]; then
    if command -v brew >/dev/null 2>&1; then
      echo "Installing Node.js 22 with Homebrew. This Mac had Node $(node -v 2>/dev/null || echo missing), which is too old."
      brew install node
      export PATH="$(brew --prefix node)/bin:$(brew --prefix)/bin:$PATH"
    else
      need "Install Node.js 22 LTS from https://nodejs.org, then run this again. This Mac has Node $(node -v 2>/dev/null || echo missing)."
    fi
  fi

  if [[ "$(node_major)" -lt 20 ]]; then
    need "Still on Node $(node -v). Open a new Terminal and run: brew install node
If you use nvm: nvm install 22 && nvm use 22
Then run Start-backend.command again. Do not answer yes to prisma@8 prompts."
  fi

  echo "Using Node $(node -v) from $(command -v node)"
}

ensure_postgres() {
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
    fi
    echo "Docker Postgres did not come up. Trying Homebrew Postgres…"
  fi

  if command -v brew >/dev/null 2>&1; then
    if ! brew list postgresql@16 >/dev/null 2>&1; then
      echo "Installing PostgreSQL 16 with Homebrew…"
      brew install postgresql@16
    fi
    export PATH="$(brew --prefix postgresql@16)/bin:$PATH"
    brew services start postgresql@16 >/dev/null
    echo "Waiting for Homebrew Postgres…"
    for _ in {1..40}; do
      if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
  fi

  command -v pg_isready >/dev/null 2>&1 && pg_isready -h localhost -p 5432 >/dev/null 2>&1 \
    || need "Postgres is not running. Install it with: brew install postgresql@16 && brew services start postgresql@16"

  echo "Ensuring database role jobhunt exists…"
  psql -d postgres -v ON_ERROR_STOP=0 -c "DO \$\$ BEGIN CREATE ROLE jobhunt LOGIN PASSWORD 'jobhunt'; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;" >/dev/null
  createdb -O jobhunt jobhunt >/dev/null 2>&1 || true
}

ensure_node
ensure_postgres

cd "$ROOT/backend"
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Wrote backend/.env from .env.example"
fi

echo "Installing API packages…"
rm -rf node_modules
npm install
npm run db:generate
npm run db:migrate

echo ""
echo "API starting at http://localhost:3000"
echo "Leave this window open, go back to the Mac app, tap Continue without an account."
echo ""
npm run dev
