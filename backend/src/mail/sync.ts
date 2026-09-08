import { prisma } from "../db.js";
import { fetchMessage, googleConfigured, listCandidateMessages } from "./gmail.js";
import { ingestPayload } from "./ingest.js";

export async function syncMailAccount(accountId: string) {
  const account = await prisma.mailAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error("Mail account not found");
  if (!googleConfigured()) throw new Error("Google OAuth is not configured");

  let pageToken: string | undefined;
  let ingested = 0;
  let scanned = 0;
  try {
    do {
      const page = await listCandidateMessages(account, pageToken);
      pageToken = page.nextPageToken ?? undefined;
      for (const id of page.ids) {
        scanned += 1;
        const payload = await fetchMessage(account, id);
        const before = await prisma.mailEvent.findUnique({
          where: {
            profileId_provider_messageId: {
              profileId: account.profileId,
              provider: "gmail",
              messageId: payload.messageId,
            },
          },
        });
        await ingestPayload(account.profileId, payload, account.id);
        if (!before) ingested += 1;
      }
    } while (pageToken);

    await prisma.mailAccount.update({
      where: { id: account.id },
      data: { lastSyncAt: new Date(), lastError: null },
    });
    return { scanned, ingested, email: account.email };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.mailAccount.update({
      where: { id: account.id },
      data: { lastError: message },
    });
    throw err;
  }
}

export async function syncAllAccounts() {
  const accounts = await prisma.mailAccount.findMany();
  const results = [];
  for (const account of accounts) {
    results.push(await syncMailAccount(account.id));
  }
  return results;
}

export async function syncDueAccounts() {
  const accounts = await prisma.mailAccount.findMany({ include: { profile: true } });
  const now = Date.now();
  const due = accounts.filter((account) => {
    const interval = account.profile.mailPollMinutes * 60_000;
    return !account.lastSyncAt || now - account.lastSyncAt.getTime() >= interval;
  });
  const results = [];
  for (const account of due) {
    results.push(await syncMailAccount(account.id));
  }
  return results;
}
