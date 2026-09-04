# Job Hunt OS

Backend-powered job hunt with a multiplatform SwiftUI client. Sign in with Apple or Google, upload resumes, choose role interests, watch licensed sources load independently, inspect hidden requirements, tailor a grounded resume, apply yourself, and optionally track the pipeline through Gmail.

Planning background: [docs/PLAN.md](docs/PLAN.md).

## Architecture

| Layer | Choice |
|---|---|
| Identity | Sign in with Apple + Google ID tokens, rotating refresh sessions |
| API | Hono on Fly (`web`) |
| Worker | Singleton Fly process with encrypted `/data` volume for temp parse files |
| Database | Fly Managed Postgres |
| Objects | Tigris + application envelope encryption |
| Mail classifier | `gpt-4o-mini` after deterministic rules |
| Client | SwiftUI iPhone + Mac |

Gmail `readonly` stays feature-flagged until Google verification/CASA completes. The app never scrapes LinkedIn/Indeed or auto-submits applications.

## Run the backend

Postgres is required:

```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm test
npm run dev
```

In another terminal: `npm run dev:worker`.

Swift app: [apps/swift/JobHuntOS](apps/swift/JobHuntOS). Generate the Xcode project with `xcodegen generate`. Release builds talk to `https://job-hunt-os.fly.dev`; debug builds default to `http://localhost:3000` and still allow a backend URL override.
