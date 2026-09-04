import { Hono } from "hono";
import { prisma, profileFor } from "../db.js";
import { env } from "../env.js";
import { authUrl, exchangeCode, googleConfigured } from "../mail/gmail.js";
import { ingestPayload, reviewMailEvent } from "../mail/ingest.js";
import { syncMailAccount } from "../mail/sync.js";
import type { MailPayload } from "../mail/types.js";
import { hashToken, randomToken } from "../auth/tokens.js";
import { gmailPublicEnabled } from "../usage.js";
import { enqueue } from "../queue/index.js";
import { handlePubSubPush, startWatch } from "../mail/watch.js";

export const mailRoutes = new Hono();

mailRoutes.get("/status", async (c) => {
  const profile = await profileFor(c);
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
  const profile = await profileFor(c);
  if (!gmailPublicEnabled) {
    return c.json(
      { error: "Gmail tracking is not enabled until Google restricted-scope verification completes." },
      403,
    );
  }
  if (!googleConfigured()) {
    return c.json(
      {
        error: "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.",
      },
      400,
    );
  }
  const state = randomToken();
  await prisma.oAuthState.create({
    data: {
      profileId: profile.id,
      purpose: "gmail",
      stateHash: hashToken(state),
      redirectTo: "jobhuntos://gmail-connected",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  return c.json({ authorizationUrl: authUrl(state) });
});

mailRoutes.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const err = c.req.query("error");
  if (err) return c.redirect(`/?mail_error=${encodeURIComponent(err)}`);
  if (!code || !state) return c.redirect("/?mail_error=missing_code_or_state");
  try {
    const oauthState = await prisma.oAuthState.findUnique({
      where: { stateHash: hashToken(state) },
    });
    if (
      !oauthState ||
      oauthState.purpose !== "gmail" ||
      oauthState.consumedAt ||
      oauthState.expiresAt <= new Date()
    ) {
      return c.redirect("/?mail_error=invalid_state");
    }
    await prisma.oAuthState.update({
      where: { id: oauthState.id },
      data: { consumedAt: new Date() },
    });
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: oauthState.profileId } });
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
    const account = await prisma.mailAccount.findUnique({
      where: {
        profileId_provider_email: {
          profileId: profile.id,
          provider: "gmail",
          email: tokens.email,
        },
      },
    });
    if (account) {
      await enqueue("mail_sync", { accountId: account.id }, { profileId: profile.id, dedupeKey: `mail:${account.id}` });
      await startWatch(account.id).catch(() => undefined);
    }
    return c.redirect(oauthState.redirectTo ?? "/?mail=connected");
  } catch (e) {
    const message = e instanceof Error ? e.message : "oauth_failed";
    return c.redirect(`/?mail_error=${encodeURIComponent(message)}`);
  }
});

mailRoutes.post("/sync", async (c) => {
  const profile = await profileFor(c);
  const accounts = await prisma.mailAccount.findMany({ where: { profileId: profile.id } });
  if (accounts.length === 0) return c.json({ error: "No Gmail account connected" }, 400);
  const results = [];
  for (const account of accounts) {
    results.push(await syncMailAccount(account.id));
  }
  return c.json({ results });
});

mailRoutes.get("/events", async (c) => {
  const profile = await profileFor(c);
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
  const profile = await profileFor(c);
  const id = c.req.param("id");
  const body = await c.req.json<{
    action: "confirm" | "ignore";
    company?: string;
    jobTitle?: string;
    classification?: string;
  }>();
  const event = await reviewMailEvent(profile.id, id, body.action, body);
  return c.json({ event });
});

mailRoutes.delete("/google", async (c) => {
  const profile = await profileFor(c);
  await prisma.mailAccount.deleteMany({ where: { profileId: profile.id, provider: "gmail" } });
  return c.json({ ok: true });
});

mailRoutes.post("/google/pubsub", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { message?: { data?: string } };
  const encoded = body.message?.data;
  if (!encoded) return c.json({ ok: true });
  const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    emailAddress?: string;
    historyId?: string;
  };
  await handlePubSubPush(decoded);
  return c.json({ ok: true });
});

/** Dev / tests: ingest a payload without Google. */
mailRoutes.post("/dev/ingest", async (c) => {
  if (env.nodeEnv === "production") return c.json({ error: "not found" }, 404);
  const profile = await profileFor(c);
  const payload = (await c.req.json()) as MailPayload;
  if (!payload.messageId) return c.json({ error: "messageId required" }, 400);
  const event = await ingestPayload(profile.id, payload);
  return c.json({ event });
});

