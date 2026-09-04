import { serve } from "@hono/node-server";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { app } from "./app.js";
import { env } from "./env.js";
import { ensureProfile } from "./db.js";
import { syncDueAccounts } from "./mail/sync.js";
import { runStandingSearches } from "./jobs/scheduler.js";
import { loadServerSecrets } from "./routes/settings.js";

mkdirSync(resolve(import.meta.dirname, "../.data"), { recursive: true });
await ensureProfile();
await loadServerSecrets();

setInterval(() => {
  syncDueAccounts().catch((err) => console.error("mail poll failed", err));
}, 60_000);
setInterval(() => {
  runStandingSearches().catch((err) => console.error("standing job search failed", err));
}, env.jobRefreshMs);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`Job Hunt OS backend on http://localhost:${info.port}`);
  console.log(`Mail classifier model: ${env.openaiModel}`);
});
