# Job Hunt OS

Backend-powered job hunt with a multiplatform SwiftUI client. Continue as a guest, or sign in with Apple or Google later. Upload resumes, choose role interests, watch licensed sources load independently, inspect hidden requirements, tailor a grounded resume, apply yourself, and optionally track the pipeline through Gmail.

Planning background: [docs/PLAN.md](docs/PLAN.md).

## Architecture

| Layer | Choice |
|---|---|
| Identity | Guest sessions locally; Apple + Google ID tokens when you enable them |
| API | Hono on Fly (`web`) |
| Worker | Singleton Fly process with encrypted `/data` volume for temp parse files |
| Database | Fly Managed Postgres |
| Objects | Tigris + application envelope encryption |
| Mail classifier | `gpt-4o-mini` after deterministic rules |
| Client | SwiftUI iPhone + Mac |

Gmail `readonly` stays feature-flagged until Google verification/CASA completes. The app never scrapes LinkedIn/Indeed or auto-submits applications.

## Run locally (Mac)

Needs **Node 22** (this repo will not run on Node 16) and **Postgres**. Docker is optional.

1. Double-click **`Start-backend.command`**. It installs Node/Postgres with Homebrew if needed. Leave the Terminal window open until you see the API on `http://localhost:3000`.
2. In Xcode, run **JobHuntOSApp** on **My Mac**, then tap **Continue without an account**.

If the command file is not handy:

```bash
brew install node postgresql@16
brew services start postgresql@16
export PATH="$(brew --prefix node)/bin:$(brew --prefix postgresql@16)/bin:$PATH"
node -v

createuser jobhunt
createdb -O jobhunt jobhunt
psql -d postgres -c "ALTER USER jobhunt WITH PASSWORD 'jobhunt'"

cd ~/Job-Search-Bot/backend
rm -rf node_modules
cp -n .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

`createuser` / `createdb` may already exist; that is fine. Do not accept an `npx` prompt for Prisma 8.

In another terminal: `npm run dev:worker` (needed for resume parsing).

Swift app: [apps/swift/JobHuntOS](apps/swift/JobHuntOS). On a Mac, double-click `apps/swift/JobHuntOS/Open-in-Xcode.command`, or `open apps/swift/JobHuntOS/Package.swift` and run the **JobHuntOSApp** scheme on **My Mac**.
