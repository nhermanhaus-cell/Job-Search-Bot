import { google } from "googleapis";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { gmailFor, googleConfigured } from "./gmail.js";
import { enqueue } from "../queue/index.js";
import { gmailPublicEnabled } from "../usage.js";

export async function startWatch(accountId: string) {
  if (!googleConfigured() || !gmailPublicEnabled) return;
  const account = await prisma.mailAccount.findUnique({ where: { id: accountId } });
  if (!account) return;
  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topic) return;
  const gmail = gmailFor(account);
  const result = await gmail.users.watch({
    userId: "me",
    requestBody: { topicName: topic, labelIds: ["INBOX"] },
  });
  await prisma.mailAccount.update({
    where: { id: account.id },
    data: {
      historyId: result.data.historyId ? String(result.data.historyId) : account.historyId,
      watchExpiresAt: result.data.expiration ? new Date(Number(result.data.expiration)) : null,
    },
  });
}

export async function renewWatches() {
  if (!googleConfigured() || !gmailPublicEnabled) return;
  const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const accounts = await prisma.mailAccount.findMany({
    where: { OR: [{ watchExpiresAt: null }, { watchExpiresAt: { lte: soon } }] },
  });
  for (const account of accounts) {
    try {
      await startWatch(account.id);
    } catch (error) {
      logger.warn({ accountId: account.id }, "gmail watch renew failed");
    }
  }
}

export async function handlePubSubPush(body: { emailAddress?: string; historyId?: string }) {
  if (!body.emailAddress) return;
  const accounts = await prisma.mailAccount.findMany({ where: { email: body.emailAddress } });
  for (const account of accounts) {
    if (body.historyId) {
      await prisma.mailAccount.update({
        where: { id: account.id },
        data: { historyId: body.historyId },
      });
    }
    await enqueue("mail_sync", { accountId: account.id }, { profileId: account.profileId, dedupeKey: `mail:${account.id}` });
  }
}

export function googleOAuthClient() {
  return new google.auth.OAuth2(env.googleClientId, env.googleClientSecret);
}
