import { createHash } from "node:crypto";
import { Hono } from "hono";
import { encryptSecret } from "../crypto.js";
import { prisma } from "../db.js";
import { requireAuth, type APIEnv } from "../auth/middleware.js";
import { verifyAppleIdentity, verifyGoogleIdentity } from "../auth/providers.js";
import { clientIp, rateLimit } from "../auth/rateLimit.js";
import {
  createSession,
  randomToken,
  revokeSessionFamily,
  rotateSession,
} from "../auth/tokens.js";
import { enqueue } from "../queue/index.js";

export const authRoutes = new Hono<APIEnv>();

authRoutes.use("*", async (c, next) => {
  const ip = clientIp({ get: (name) => c.req.header(name) });
  if (!rateLimit(`${ip}:${c.req.path}`, 30, 60_000)) {
    return c.json({ error: "rate_limited" }, 429);
  }
  await next();
});

authRoutes.post("/challenge", async (c) => {
  const body = await c.req.json<{
    provider: "apple" | "google";
    intent: "signup" | "login" | "link";
  }>();
  if (!["apple", "google"].includes(body.provider) || !["signup", "login", "link"].includes(body.intent)) {
    return c.json({ error: "invalid_challenge" }, 400);
  }
  let userId: string | undefined;
  if (body.intent === "link") {
    const header = c.req.header("Authorization") ?? "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (!token) return c.json({ error: "authentication_required" }, 401);
    const { verifyAccessToken } = await import("../auth/tokens.js");
    userId = (await verifyAccessToken(token)).userId;
  }
  const nonce = randomToken();
  const challenge = await prisma.authChallenge.create({
    data: {
      provider: body.provider,
      intent: body.intent,
      nonceHash: createHash("sha256").update(nonce).digest("hex"),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      userId,
    },
  });
  return c.json({ challengeId: challenge.id, nonce, expiresAt: challenge.expiresAt });
});

authRoutes.post("/exchange/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (provider !== "apple" && provider !== "google") return c.json({ error: "unsupported_provider" }, 404);
  const body = await c.req.json<{
    challengeId: string;
    identityToken: string;
    authorizationCode?: string;
    fullName?: string;
  }>();
  const challenge = await prisma.authChallenge.findUnique({ where: { id: body.challengeId } });
  if (
    !challenge ||
    challenge.provider !== provider ||
    challenge.consumedAt ||
    challenge.expiresAt <= new Date()
  ) {
    return c.json({ error: "invalid_or_expired_challenge" }, 401);
  }

  try {
    const verified =
      provider === "apple"
        ? await verifyAppleIdentity({
            identityToken: body.identityToken,
            authorizationCode: body.authorizationCode,
            expectedNonceHash: challenge.nonceHash,
          })
        : await verifyGoogleIdentity(body.identityToken, challenge.nonceHash);

    const existing = await prisma.authIdentity.findUnique({
      where: { provider_subject: { provider, subject: verified.subject } },
      include: { user: { include: { profile: true } } },
    });
    if (challenge.intent === "login" && !existing) {
      return c.json({ error: "account_not_found" }, 404);
    }
    if (challenge.intent === "link") {
      if (!challenge.userId) return c.json({ error: "authentication_required" }, 401);
      if (existing && existing.userId !== challenge.userId) {
        return c.json({ error: "identity_already_linked" }, 409);
      }
      await prisma.authIdentity.upsert({
        where: { provider_subject: { provider, subject: verified.subject } },
        create: {
          userId: challenge.userId,
          provider,
          subject: verified.subject,
          email: verified.email,
          emailVerified: verified.emailVerified,
          providerRefreshEnc: verified.providerRefreshToken
            ? encryptSecret(verified.providerRefreshToken)
            : null,
        },
        update: {},
      });
      await prisma.authChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      return c.json({ linked: true });
    }

    let user = existing?.user;
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: verified.emailVerified ? verified.email : null,
          name: body.fullName?.trim() || null,
          identities: {
            create: {
              provider,
              subject: verified.subject,
              email: verified.email,
              emailVerified: verified.emailVerified,
              providerRefreshEnc: verified.providerRefreshToken
                ? encryptSecret(verified.providerRefreshToken)
                : null,
            },
          },
          profile: {
            create: {
              name: body.fullName?.trim() || null,
              email: verified.emailVerified ? verified.email : null,
            },
          },
        },
        include: { profile: true },
      });
    } else if (verified.providerRefreshToken) {
      await prisma.authIdentity.update({
        where: { provider_subject: { provider, subject: verified.subject } },
        data: { providerRefreshEnc: encryptSecret(verified.providerRefreshToken) },
      });
    }
    await prisma.authChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    if (!user.profile) throw new Error("profile_missing");
    const session = await createSession(user.id, user.profile.id, {
      userAgent: c.req.header("User-Agent"),
      ipAddress: c.req.header("Fly-Client-IP") ?? c.req.header("X-Forwarded-For"),
    });
    return c.json({ session }, existing ? 200 : 201);
  } catch (error) {
    console.error("identity exchange failed", error instanceof Error ? error.message : "unknown");
    return c.json({ error: "identity_verification_failed" }, 401);
  }
});

authRoutes.post("/refresh", async (c) => {
  const body = await c.req.json<{ refreshToken: string }>();
  try {
    const session = await rotateSession(body.refreshToken, {
      userAgent: c.req.header("User-Agent"),
      ipAddress: c.req.header("Fly-Client-IP") ?? c.req.header("X-Forwarded-For"),
    });
    return c.json({ session });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "refresh_failed" }, 401);
  }
});

authRoutes.use("/session", requireAuth);
authRoutes.get("/session", async (c) => {
  const auth = c.get("auth");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: auth.userId },
    include: { identities: { select: { provider: true } }, profile: true },
  });
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      providers: user.identities.map((identity) => identity.provider),
    },
    onboardingDone: user.profile?.onboardingDone ?? false,
  });
});

authRoutes.use("/logout", requireAuth);
authRoutes.post("/logout", async (c) => {
  await revokeSessionFamily(c.get("auth").sessionId);
  return c.json({ ok: true });
});

authRoutes.use("/export", requireAuth);
authRoutes.get("/export", async (c) => {
  const auth = c.get("auth");
  const profile = await prisma.profile.findFirstOrThrow({
    where: { id: auth.profileId, userId: auth.userId },
    include: {
      applications: true,
      experienceItems: true,
      mailEvents: true,
      matches: true,
      resumeDocuments: true,
      resumeVersions: true,
      skills: true,
      titleInterests: true,
    },
  });
  return c.json({
    exportedAt: new Date(),
    profile: {
      ...profile,
      resumeDocuments: profile.resumeDocuments.map(({ rawText: _raw, ...document }) => document),
    },
  });
});

authRoutes.use("/account", requireAuth);
authRoutes.delete("/account", async (c) => {
  const auth = c.get("auth");
  const body = await c.req.json<{ confirmation: string }>().catch(() => ({ confirmation: "" }));
  if (body.confirmation !== "DELETE") return c.json({ error: "confirmation_required" }, 400);
  const request = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: auth.userId }, data: { status: "deleting" } });
    await tx.session.updateMany({
      where: { userId: auth.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return tx.deletionRequest.create({
      data: { userId: auth.userId, profileId: auth.profileId },
    });
  });
  await enqueue("account_deletion", { deletionRequestId: request.id }, { dedupeKey: `delete:${request.id}` });
  return c.json({ deletionRequestId: request.id, status: request.status }, 202);
});

authRoutes.post("/apple/notifications", async (c) => {
  const body = await c.req.json<{ payload?: string }>().catch(() => ({ payload: "" }));
  if (!body.payload) return c.json({ ok: true });
  try {
    const { createRemoteJWKSet, jwtVerify } = await import("jose");
    const keys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
    const { payload } = await jwtVerify(body.payload, keys, { issuer: "https://appleid.apple.com" });
    const events = typeof payload.events === "string" ? JSON.parse(payload.events) : payload.events;
    const event = events as { type?: string; sub?: string } | undefined;
    if (event?.type === "consent-revoked" && event.sub) {
      const identity = await prisma.authIdentity.findUnique({
        where: { provider_subject: { provider: "apple", subject: event.sub } },
      });
      if (identity) {
        await prisma.user.update({ where: { id: identity.userId }, data: { status: "deleting" } });
        const profile = await prisma.profile.findUnique({ where: { userId: identity.userId } });
        if (profile) {
          const request = await prisma.deletionRequest.create({
            data: { userId: identity.userId, profileId: profile.id },
          });
          await enqueue("account_deletion", { deletionRequestId: request.id }, { dedupeKey: `delete:${request.id}` });
        }
      }
    }
  } catch {
    return c.json({ error: "invalid_notification" }, 400);
  }
  return c.json({ ok: true });
});
