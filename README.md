# Job Hunt OS

Backend-powered job hunt with a SwiftUI client. This slice ships **automatic Gmail tracking**: connect Gmail once, classify recruiter mail on the server, update the application tracker, and chart the pipeline in Swift.

Planning background: [docs/PLAN.md](docs/PLAN.md).

## Model choice (this build)

| Layer | Choice | Why |
|---|---|---|
| Mail classifier | **`gpt-4o-mini`** (`OPENAI_MODEL`) | Closed labels (receipt / rejection / interview / offer). Structured JSON, cheap, fast. Rules run first; the model only sees low-confidence snippets. |
| Do not use | Frontier chat models on every email | Wasteful for this taxonomy; keep them for resume tailoring later |
| Do not use | On-device LLM in Swift | Tokens, Gmail OAuth, and rate limits belong on the backend |
| App architecture | **TypeScript backend + SwiftUI client** | Linux/Mac worker can poll Gmail; the phone only syncs |

Set `OPENAI_API_KEY` to enable the model fallback. Without it, deterministic rules still file high-signal ATS mail.

## Run the backend

```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000):

- **Load demo inbox** — no Google or OpenAI keys
- **Connect Gmail** — after you add `GOOGLE_OAUTH_CLIENT_ID` / `SECRET` (redirect `http://localhost:3000/api/mail/google/callback`)

Swift package: [apps/swift/JobHuntOS](apps/swift/JobHuntOS). Charts and the tracker read `/api/applications/stats` and `/api/sync`.
