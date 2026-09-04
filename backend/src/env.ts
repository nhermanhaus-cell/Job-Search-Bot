import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv() {
  const path = resolve(import.meta.dirname, "../.env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    if (process.env[key]) continue;
    process.env[key] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
  }
}

loadDotEnv();

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

const root = resolve(import.meta.dirname, "..");

export const env = {
  port: Number(optional("PORT", "3000")),
  publicUrl: optional("PUBLIC_URL", "http://localhost:3000"),
  databaseUrl: optional("DATABASE_URL", `file:${resolve(root, ".data/app.db")}`),
  openaiApiKey: optional("OPENAI_API_KEY"),
  /** Mail classification only. gpt-4o-mini is the default: structured JSON, cheap, fast. */
  openaiModel: optional("OPENAI_MODEL", "gpt-4o-mini"),
  googleClientId: optional("GOOGLE_OAUTH_CLIENT_ID"),
  googleClientSecret: optional("GOOGLE_OAUTH_CLIENT_SECRET"),
  tokenKey: optional("MAIL_TOKEN_ENCRYPTION_KEY", "dev-only-change-me-32-chars!!!!"),
  adzunaAppId: optional("ADZUNA_APP_ID"),
  adzunaAppKey: optional("ADZUNA_APP_KEY"),
  usajobsApiKey: optional("USAJOBS_API_KEY"),
  usajobsEmail: optional("USAJOBS_EMAIL"),
  jsearchApiKey: optional("JSEARCH_API_KEY", optional("RAPIDAPI_KEY")),
  joobleApiKey: optional("JOOBLE_API_KEY"),
  greenhouseBoards: optional("GREENHOUSE_BOARDS"),
  leverSites: optional("LEVER_SITES"),
  ashbyBoards: optional("ASHBY_BOARDS"),
  jobRefreshMs: Number(optional("JOB_REFRESH_MS", String(4 * 60 * 60 * 1000))),
  nodeEnv: optional("NODE_ENV", "development"),
  authJwtSecret: optional("AUTH_JWT_SECRET", "dev-only-auth-secret-change-me"),
  authIssuer: optional("AUTH_ISSUER", "job-hunt-os"),
  appleClientIds: optional("APPLE_CLIENT_IDS", "com.jobhuntos.app,com.jobhuntos.mac")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  appleTeamId: optional("APPLE_TEAM_ID"),
  appleKeyId: optional("APPLE_KEY_ID"),
  applePrivateKey: optional("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  googleServerClientIds: optional("GOOGLE_SERVER_CLIENT_IDS", optional("GOOGLE_OAUTH_CLIENT_ID"))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  objectBucket: optional("BUCKET_NAME", "job-hunt-os"),
  objectEndpoint: optional("AWS_ENDPOINT_URL_S3", "https://t3.storage.dev"),
  objectRegion: optional("AWS_REGION", "auto"),
  objectAccessKey: optional("AWS_ACCESS_KEY_ID"),
  objectSecretKey: optional("AWS_SECRET_ACCESS_KEY"),
  objectEncryptionKey: optional("OBJECT_ENCRYPTION_KEY", optional("MAIL_TOKEN_ENCRYPTION_KEY")),
  dataDir: optional("DATA_DIR", resolve(root, ".data")),
  sentryDsn: optional("SENTRY_DSN"),
  allowedOrigins: optional("ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  gmailPublicEnabled: optional("GMAIL_PUBLIC_ENABLED", "false") === "true",
};

export const googleRedirectUri = `${env.publicUrl.replace(/\/$/, "")}/api/mail/google/callback`;

export const gmailScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function assertProductionEnv() {
  if (env.nodeEnv !== "production") return;
  const missing = [
    ["AUTH_JWT_SECRET", env.authJwtSecret],
    ["MAIL_TOKEN_ENCRYPTION_KEY", env.tokenKey],
    ["OBJECT_ENCRYPTION_KEY", env.objectEncryptionKey],
    ["BUCKET_NAME", env.objectBucket],
    ["AWS_ACCESS_KEY_ID", env.objectAccessKey],
    ["AWS_SECRET_ACCESS_KEY", env.objectSecretKey],
  ].filter(([, value]) => !value || String(value).includes("dev-only"));
  if (missing.length) {
    throw new Error(`Missing required production secrets: ${missing.map(([name]) => name).join(", ")}`);
  }
}
