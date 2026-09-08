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

1. Double-click **`Start-backend.command`** (needs Node 20+ and Docker Desktop, or Homebrew Postgres). Leave that Terminal window open until you see the API on `http://localhost:3000`.
2. In Xcode, run **JobHuntOSApp** on **My Mac**, then tap **Continue without an account**.

Manual equivalent:

```bash
docker compose up -d
cd backend
cp -n .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

In another terminal: `npm run dev:worker` (needed for resume parsing).

Swift app: [apps/swift/JobHuntOS](apps/swift/JobHuntOS). On a Mac, double-click `apps/swift/JobHuntOS/Open-in-Xcode.command`, or `open apps/swift/JobHuntOS/Package.swift` and run the **JobHuntOSApp** scheme on **My Mac**.
