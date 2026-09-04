# Job Hunt OS

Backend-powered job hunt with a complete multiplatform SwiftUI client. Upload resumes, choose role interests, watch sources load independently, inspect hidden requirements, tailor a grounded resume, apply, and track the pipeline through Gmail.

Planning background: [docs/PLAN.md](docs/PLAN.md).

## Model choice (this build)

| Layer | Choice | Why |
|---|---|---|
| Mail classifier | **`gpt-4o-mini`** (`OPENAI_MODEL`) | Closed labels (receipt / rejection / interview / offer). Structured JSON, cheap, fast. Rules run first; the model only sees low-confidence snippets. |
| Do not use | Frontier chat models on every email | Wasteful for this taxonomy; keep them for resume tailoring later |
| Do not use | On-device LLM in Swift | Tokens, Gmail OAuth, and rate limits belong on the backend |
| App architecture | **TypeScript backend + SwiftUI client** | Linux/Mac worker can poll Gmail; the phone only syncs |

Set `OPENAI_API_KEY` to enable the model fallback. Without it, deterministic rules still file high-signal ATS mail.

## What is implemented

- **SwiftUI app:** iPhone tabs + Mac sidebar for Home, Hunt, Resume, Tracker, Settings
- **Resume intake:** multiple PDF/DOCX/TXT files, merged facts, title suggestions
- **Live hunt:** Demo, Remotive, Remote OK; optional Adzuna and USAJobs; SSE source status
- **Deep JD matching:** years, seniority, skills, implied leadership, travel, degree and authorization signals
- **Easy / medium / reach** with explainable score components and override
- **Tailoring:** accept/reject/edit grounded suggestions and download a job-specific packet
- **Swift Charts:** new matches, difficulty mix, application funnel
- **SwiftData cache:** last profile, jobs and tracker state available offline
- **Automatic Gmail tracking:** receipts, rejections and interviews update applications

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

Swift app: [apps/swift/JobHuntOS](apps/swift/JobHuntOS). Generate the iOS/macOS Xcode project with `xcodegen generate`, or open `Package.swift` for the macOS executable.
