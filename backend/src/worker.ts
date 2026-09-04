import { mkdir } from "node:fs/promises";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { claimJob, completeJob, failJob, trySingletonLock } from "./queue/index.js";
import { enqueueDueWork, handleJob, handleTmpCleanup } from "./queue/handlers.js";
import { ensureBucket } from "./storage/index.js";

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
await ensureBucket();
await handleTmpCleanup();

const locked = await trySingletonLock(42_001);
if (!locked) {
  logger.warn("another worker holds the singleton lock; this process will only drain jobs");
}

logger.info({ dataDir: env.dataDir, singleton: locked }, "Job Hunt OS worker starting");

async function loop() {
  let idleTicks = 0;
  while (true) {
    const job = await claimJob().catch((error) => {
      logger.error({ err: error instanceof Error ? error.message : "claim_failed" }, "claim failed");
      return null;
    });
    if (!job) {
      idleTicks += 1;
      if (locked && idleTicks % 15 === 1) {
        await enqueueDueWork().catch((error) => logger.error({ err: String(error) }, "due work enqueue failed"));
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    idleTicks = 0;
    try {
      await handleJob(job);
      await completeJob(job.id);
    } catch (error) {
      await failJob(job.id, error, job.attempts, job.maxAttempts);
    }
  }
}

loop().catch((error) => {
  logger.fatal({ err: error instanceof Error ? error.message : "fatal" }, "worker crashed");
  process.exit(1);
});
