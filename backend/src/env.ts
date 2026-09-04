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
};

export const googleRedirectUri = `${env.publicUrl.replace(/\/$/, "")}/api/mail/google/callback`;

export const gmailScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
];
