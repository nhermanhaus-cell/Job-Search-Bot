# Job Hunt OS backend

Hono + Prisma + SQLite. Owns Gmail OAuth, mail ingest, and classification.

## Classifier model

**Default: `gpt-4o-mini`** (`OPENAI_MODEL`).

Mail labeling is a closed taxonomy (receipt / rejection / interview / offer / ignore). `gpt-4o-mini` is the right default for a SwiftUI + backend build:

- Structured JSON output
- Cheap enough to run on every new ATS thread
- Fast enough that Sync does not stall the phone
- Stays on the server so the Swift app never holds an OpenAI or Google token

Deterministic rules run first. The model is only called when confidence is low **and** `OPENAI_API_KEY` is set. Swap with `OPENAI_MODEL=gpt-4.1-mini` (or later mini-class models) if interview-time extraction is weak — do not put a frontier model on this path.

## Run

```bash
cd backend
cp .env.example .env   # already present for local
npm install
npx prisma generate
npx prisma db push
npm test
npm run dev
```

Open http://localhost:3000 — Connect Gmail, or **Load demo inbox** without Google keys.

## Connect Gmail

1. Google Cloud project → enable Gmail API.
2. OAuth client type **Web application**.
3. Redirect URI: `http://localhost:3000/api/mail/google/callback` (or your `PUBLIC_URL`).
4. Set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.
5. Scope requested: `gmail.readonly` only.

The worker polls every `MAIL_POLL_MS` (default 15 minutes) after a account is connected.
