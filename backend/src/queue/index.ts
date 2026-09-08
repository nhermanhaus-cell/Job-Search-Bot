import { prisma } from "../db.js";
import { logger } from "../logger.js";

export type QueueJobType =
  | "parse_resume"
  | "mail_sync"
  | "standing_search"
  | "account_deletion"
  | "gmail_watch_renew"
  | "tmp_cleanup";

export type QueueJob = {
  id: string;
  type: QueueJobType;
  profileId: string | null;
  payloadJson: string;
  attempts: number;
  maxAttempts: number;
};

const WORKER_ID = process.env.FLY_MACHINE_ID || `worker-${process.pid}`;

export async function enqueue(
  type: QueueJobType,
  payload: Record<string, unknown>,
  options: { profileId?: string; dedupeKey?: string; runAt?: Date; maxAttempts?: number } = {},
) {
  if (options.dedupeKey) {
    const existing = await prisma.jobQueue.findUnique({ where: { dedupeKey: options.dedupeKey } });
    if (existing && ["queued", "running"].includes(existing.status)) return existing;
  }
  return prisma.jobQueue.create({
    data: {
      type,
      profileId: options.profileId,
      payloadJson: JSON.stringify(payload),
      dedupeKey: options.dedupeKey,
      runAt: options.runAt,
      maxAttempts: options.maxAttempts ?? 5,
    },
  });
}

export async function claimJob(): Promise<QueueJob | null> {
  const rows = await prisma.$queryRaw<QueueJob[]>`
    WITH next AS (
      SELECT id
      FROM "JobQueue"
      WHERE status = 'queued' AND "runAt" <= NOW()
      ORDER BY "runAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "JobQueue" q
    SET status = 'running',
        "lockedAt" = NOW(),
        "lockedBy" = ${WORKER_ID},
        attempts = q.attempts + 1,
        "updatedAt" = NOW()
    FROM next
    WHERE q.id = next.id
    RETURNING q.id, q.type, q."profileId", q."payloadJson", q.attempts, q."maxAttempts"
  `;
  return rows[0] ?? null;
}

export async function completeJob(id: string) {
  await prisma.jobQueue.update({
    where: { id },
    data: { status: "done", lockedAt: null, lockedBy: null, lastError: null },
  });
}

export async function failJob(id: string, error: unknown, attempts: number, maxAttempts: number) {
  const message = error instanceof Error ? error.message : String(error);
  const dead = attempts >= maxAttempts;
  const delayMs = Math.min(30 * 60_000, 2 ** Math.min(attempts, 8) * 1000 + Math.floor(Math.random() * 500));
  await prisma.jobQueue.update({
    where: { id },
    data: {
      status: dead ? "dead" : "queued",
      lastError: message.slice(0, 1000),
      lockedAt: null,
      lockedBy: null,
      runAt: dead ? new Date() : new Date(Date.now() + delayMs),
    },
  });
  logger.warn({ jobId: id, dead, err: message }, "queue job failed");
}

export async function trySingletonLock(key: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${key}) AS locked`;
  return Boolean(rows[0]?.locked);
}
