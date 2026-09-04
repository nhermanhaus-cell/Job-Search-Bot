# Job Hunt OS backend

Hono + Prisma + PostgreSQL. Multi-user system of record for Apple/Google auth, encrypted resume objects, provider search, matching/tailoring, application charts, and optional Gmail classification.

## Run locally

Postgres is required (SQLite is no longer used):

```bash
createdb jobhunt
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm test
npm run dev          # web API
npm run dev:worker   # parse / mail / deletion queue
```

Open http://localhost:3000/api/health/live. Privacy and terms are at `/privacy` and `/terms`. The HTML dashboard is hidden when `NODE_ENV=production`.

## Auth

Native apps call:

- `POST /api/auth/challenge` — one-use nonce
- `POST /api/auth/exchange/apple|google` — signup, login, or authenticated link
- `POST /api/auth/refresh` — rotating refresh tokens (reuse revokes the family)
- `GET /api/auth/session`, `POST /api/auth/logout`
- `GET /api/auth/export`, `DELETE /api/auth/account`

Login never creates an account. Apple and Google are not auto-linked by email.

## Storage

Resumes and generated PDF packets are envelope-encrypted (AES-256-GCM data key wrapped by `OBJECT_ENCRYPTION_KEY`) and stored in Tigris in production, or `.data/objects` locally. `rawText` is not persisted. Account deletion crypto-shreds wrapped keys, then deletes the user prefix.

## Fly

See [fly.toml](../fly.toml): `web` is a stateless API; `worker` is a singleton with encrypted volume `jobhunt_worker_data` at `/data`. Secrets belong in `fly secrets`, never files.

Gmail tracking is off in production until `GMAIL_PUBLIC_ENABLED=true` after Google restricted-scope verification.
