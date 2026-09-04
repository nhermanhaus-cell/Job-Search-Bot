import { serve } from "@hono/node-server";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { app } from "./app.js";
import { env } from "./env.js";
import { ensureProfile } from "./db.js";
import { googleConfigured } from "./mail/gmail.js";
import { syncAllAccounts } from "./mail/sync.js";
import { runStandingSearches } from "./jobs/scheduler.js";

mkdirSync(resolve(import.meta.dirname, "../.data"), { recursive: true });
await ensureProfile();

const POLL_MS = Number(process.env.MAIL_POLL_MS ?? 15 * 60 * 1000);
if (googleConfigured()) {
  setInterval(() => {
    syncAllAccounts().catch((err) => console.error("mail poll failed", err));
  }, POLL_MS);
}
setInterval(() => {
  runStandingSearches().catch((err) => console.error("standing job search failed", err));
}, env.jobRefreshMs);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`Job Hunt OS backend on http://localhost:${info.port}`);
  console.log(`Mail classifier model: ${env.openaiModel}`);
});
