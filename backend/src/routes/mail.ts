import { Hono } from "hono";
import { prisma, ensureProfile } from "../db.js";
import { env } from "../env.js";
import { authUrl, exchangeCode, googleConfigured } from "../mail/gmail.js";
import { ingestPayload, reviewMailEvent } from "../mail/ingest.js";
import { syncMailAccount } from "../mail/sync.js";
import type { MailPayload } from "../mail/types.js";

export const mailRoutes = new Hono();

mailRoutes.get("/status", async (c) => {
  const profile = await ensureProfile();
  const accounts = await prisma.mailAccount.findMany({ where: { profileId: profile.id } });
  const pending = await prisma.mailEvent.count({
    where: { profileId: profile.id, reviewState: "pending" },
  });
  return c.json({
    googleConfigured: googleConfigured(),
    openaiModel: env.openaiModel,
    openaiConfigured: Boolean(env.openaiApiKey),
    accounts: accounts.map((a) => ({
      id: a.id,
      email: a.email,
      lastSyncAt: a.lastSyncAt,
      lastError: a.lastError,
      connectedAt: a.connectedAt,
    })),
    pendingReview: pending,
  });
});

mailRoutes.get("/google/start", async (c) => {
  if (!googleConfigured()) {
    return c.json(
      {
        error: "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.",
      },
      400,
    );
  }
  return c.redirect(authUrl("local"));
});

mailRoutes.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const err = c.req.query("error");
  if (err) return c.redirect(`/?mail_error=${encodeURIComponent(err)}`);
  if (!code) return c.redirect("/?mail_error=missing_code");
  try {
    const profile = await ensureProfile();
    const tokens = await exchangeCode(code);
    await prisma.mailAccount.upsert({
      where: {
        profileId_provider_email: {
          profileId: profile.id,
          provider: "gmail",
          email: tokens.email,
        },
      },
      create: {
        profileId: profile.id,
        email: tokens.email,
        refreshTokenEnc: tokens.refreshTokenEnc,
        accessTokenEnc: tokens.accessTokenEnc,
        accessTokenExp: tokens.accessTokenExp,
      },
      update: {
        refreshTokenEnc: tokens.refreshTokenEnc,
        accessTokenEnc: tokens.accessTokenEnc,
        accessTokenExp: tokens.accessTokenExp,
        lastError: null,
      },
    });
    return c.redirect("/?mail=connected");
  } catch (e) {
    const message = e instanceof Error ? e.message : "oauth_failed";
    return c.redirect(`/?mail_error=${encodeURIComponent(message)}`);
  }
});

mailRoutes.post("/sync", async (c) => {
  const profile = await ensureProfile();
  const accounts = await prisma.mailAccount.findMany({ where: { profileId: profile.id } });
  if (accounts.length === 0) return c.json({ error: "No Gmail account connected" }, 400);
  const results = [];
  for (const account of accounts) {
    results.push(await syncMailAccount(account.id));
  }
  return c.json({ results });
});

mailRoutes.get("/events", async (c) => {
  const profile = await ensureProfile();
  const reviewState = c.req.query("reviewState");
  const events = await prisma.mailEvent.findMany({
    where: {
      profileId: profile.id,
      ...(reviewState ? { reviewState } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { application: true },
  });
  return c.json({ events });
});

mailRoutes.post("/events/:id/review", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    action: "confirm" | "ignore";
    company?: string;
    jobTitle?: string;
    classification?: string;
  }>();
  const event = await reviewMailEvent(id, body.action, body);
  return c.json({ event });
});

mailRoutes.delete("/google", async (c) => {
  const profile = await ensureProfile();
  await prisma.mailAccount.deleteMany({ where: { profileId: profile.id, provider: "gmail" } });
  return c.json({ ok: true });
});

/** Dev / tests: ingest a payload without Google. */
mailRoutes.post("/dev/ingest", async (c) => {
  const profile = await ensureProfile();
  const payload = (await c.req.json()) as MailPayload;
  if (!payload.messageId) return c.json({ error: "messageId required" }, 400);
  const event = await ingestPayload(profile.id, payload);
  return c.json({ event });
});

