# syntax=docker/dockerfile:1
# Build context is the repository root (see fly.toml).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system app && useradd --system --gid app --create-home app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/package.json backend/package-lock.json backend/tsconfig.json ./
COPY backend/prisma ./prisma
COPY backend/src ./src
RUN npx prisma generate && chown -R app:app /app
USER app
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
