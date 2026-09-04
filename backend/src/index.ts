import { serve } from "@hono/node-server";
import { mkdir } from "node:fs/promises";
import { app } from "./app.js";
import { env, assertProductionEnv } from "./env.js";
import { logger } from "./logger.js";
import { ensureBucket } from "./storage/index.js";

assertProductionEnv();

if (env.sentryDsn) {
  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn: env.sentryDsn,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
      }
      return event;
    },
  });
}

await mkdir(env.dataDir, { recursive: true, mode: 0o700 });
await ensureBucket().catch((error) => {
  logger.warn({ err: error instanceof Error ? error.message : "storage" }, "object store init skipped");
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  logger.info({ port: info.port }, "Job Hunt OS web API listening");
});
