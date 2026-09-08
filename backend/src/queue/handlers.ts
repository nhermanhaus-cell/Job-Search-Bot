import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptSecret } from "../crypto.js";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { applyParsedResume } from "../intake/apply.js";
import { extractResumeBytes, parseResume } from "../intake/resume.js";
import { runStandingSearches } from "../jobs/scheduler.js";
import { logger } from "../logger.js";
import { syncMailAccount } from "../mail/sync.js";
import { revokeAppleRefreshToken } from "../auth/providers.js";
import { cryptoShred, deletePrefix, getDecryptedObject } from "../storage/index.js";
import type { QueueJob } from "./index.js";
import { enqueue } from "./index.js";

const tmpRoot = join(env.dataDir, "tmp");

async function withSecureTemp<T>(bytes: Buffer, fileName: string, fn: (path: string) => Promise<T>): Promise<T> {
  await mkdir(tmpRoot, { recursive: true, mode: 0o700 });
  await chmod(tmpRoot, 0o700).catch(() => undefined);
  const dir = await mkdtemp(join(tmpRoot, "parse-"));
  await chmod(dir, 0o700);
  const path = join(dir, fileName.replace(/[^a-zA-Z0-9._-]+/g, "_") || "resume.bin");
  try {
    await writeFile(path, bytes, { mode: 0o600 });
    return await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function handleParseResume(job: QueueJob) {
  const payload = JSON.parse(job.payloadJson) as { documentId: string; profileId: string };
  const document = await prisma.resumeDocument.findFirst({
    where: { id: payload.documentId, profileId: payload.profileId },
  });
  if (!document?.objectId) throw new Error("resume_document_missing");
  const { bytes } = await getDecryptedObject(document.objectId, payload.profileId);
  const rawText = await withSecureTemp(bytes, document.fileName, async () =>
    extractResumeBytes(bytes, document.fileName, document.mediaType),
  );
  const parsed = await parseResume(rawText);
  await applyParsedResume(payload.profileId, document.id, parsed);
  await prisma.resumeDocument.update({
    where: { id: document.id },
    data: { parseJson: JSON.stringify(parsed), parseStatus: "ready", rawText: null },
  });
}

export async function handleMailSync(job: QueueJob) {
  const payload = JSON.parse(job.payloadJson) as { accountId: string };
  await syncMailAccount(payload.accountId);
}

export async function handleStandingSearch() {
  await runStandingSearches();
}

export async function handleAccountDeletion(job: QueueJob) {
  const payload = JSON.parse(job.payloadJson) as { deletionRequestId: string };
  const request = await prisma.deletionRequest.findUnique({ where: { id: payload.deletionRequestId } });
  if (!request || request.status === "done") return;
  await prisma.deletionRequest.update({
    where: { id: request.id },
    data: { status: "running", attempts: { increment: 1 } },
  });

  const identities = await prisma.authIdentity.findMany({ where: { userId: request.userId } });
  for (const identity of identities) {
    try {
      if (identity.provider === "apple" && identity.providerRefreshEnc) {
        await revokeAppleRefreshToken(decryptSecret(identity.providerRefreshEnc));
      }
    } catch {
      logger.warn({ provider: identity.provider }, "provider revoke failed during deletion");
    }
  }
  const accounts = await prisma.mailAccount.findMany({ where: { profileId: request.profileId } });
  for (const account of accounts) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: decryptSecret(account.refreshTokenEnc) }),
    }).catch(() => undefined);
  }

  await cryptoShred(request.profileId);
  await deletePrefix(request.profileId);
  await prisma.user.deleteMany({ where: { id: request.userId } });
  await prisma.deletionRequest.update({
    where: { id: request.id },
    data: { status: "done", completedAt: new Date(), lastError: null },
  });
}

export async function handleTmpCleanup() {
  await mkdir(tmpRoot, { recursive: true, mode: 0o700 });
  const { readdir, stat } = await import("node:fs/promises");
  const entries = await readdir(tmpRoot, { withFileTypes: true }).catch(() => []);
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const entry of entries) {
    const path = join(tmpRoot, entry.name);
    const info = await stat(path).catch(() => null);
    if (info && info.mtimeMs < cutoff) await rm(path, { recursive: true, force: true });
  }
}

export async function handleJob(job: QueueJob) {
  switch (job.type) {
    case "parse_resume":
      return handleParseResume(job);
    case "mail_sync":
      return handleMailSync(job);
    case "standing_search":
      return handleStandingSearch();
    case "account_deletion":
      return handleAccountDeletion(job);
    case "tmp_cleanup":
      return handleTmpCleanup();
    case "gmail_watch_renew":
      return import("../mail/watch.js").then((mod) => mod.renewWatches());
    default:
      throw new Error(`unknown_job_${job.type}`);
  }
}

export async function enqueueDueWork() {
  const accounts = await prisma.mailAccount.findMany({ include: { profile: true } });
  const now = Date.now();
  for (const account of accounts) {
    const interval = account.profile.mailPollMinutes * 60_000;
    if (!account.lastSyncAt || now - account.lastSyncAt.getTime() >= interval) {
      await enqueue("mail_sync", { accountId: account.id }, { profileId: account.profileId, dedupeKey: `mail:${account.id}` });
    }
  }
  await enqueue("standing_search", {}, { dedupeKey: "standing-search" });
  await enqueue("tmp_cleanup", {}, { dedupeKey: "tmp-cleanup" });
  await enqueue("gmail_watch_renew", {}, { dedupeKey: "gmail-watch" });
  const deletions = await prisma.deletionRequest.findMany({ where: { status: { in: ["queued", "running"] } } });
  for (const request of deletions) {
    await enqueue("account_deletion", { deletionRequestId: request.id }, { dedupeKey: `delete:${request.id}` });
  }
}
