import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "../db.js";
import { env } from "../env.js";
import type { AuthContext, AuthSessionResponse } from "./types.js";

const ACCESS_SECONDS = 15 * 60;
const REFRESH_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

function jwtKey() {
  return new TextEncoder().encode(env.authJwtSecret);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

async function signAccessToken(context: AuthContext) {
  const expiresAt = new Date(Date.now() + ACCESS_SECONDS * 1000);
  const token = await new SignJWT({ profileId: context.profileId, sid: context.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(context.userId)
    .setIssuer(env.authIssuer)
    .setAudience("job-hunt-os-native")
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(jwtKey());
  return { token, expiresAt };
}

async function publicUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { identities: { select: { provider: true } }, profile: true },
  });
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      providers: user.identities.map((identity) => identity.provider),
    },
    onboardingDone: user.profile?.onboardingDone ?? false,
  };
}

export async function createSession(
  userId: string,
  profileId: string,
  metadata: { userAgent?: string; ipAddress?: string } = {},
): Promise<AuthSessionResponse> {
  const refreshToken = randomToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_MILLISECONDS);
  const familyId = randomToken(18);
  const session = await prisma.session.create({
    data: {
      userId,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
    },
  });
  const access = await signAccessToken({ userId, profileId, sessionId: session.id });
  const identity = await publicUser(userId);
  return {
    accessToken: access.token,
    refreshToken,
    accessExpiresAt: access.expiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    ...identity,
  };
}

export async function rotateSession(
  refreshToken: string,
  metadata: { userAgent?: string; ipAddress?: string } = {},
): Promise<AuthSessionResponse> {
  const tokenHash = hashToken(refreshToken);
  const current = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: { include: { profile: true } } },
  });
  if (!current || current.revokedAt || current.expiresAt <= new Date()) {
    throw new Error("invalid_refresh_token");
  }
  if (current.consumedAt) {
    await prisma.session.updateMany({
      where: { familyId: current.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new Error("refresh_token_reuse");
  }
  if (!current.user.profile || current.user.status !== "active") {
    throw new Error("account_unavailable");
  }

  const nextToken = randomToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_MILLISECONDS);
  const next = await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: current.id },
      data: { consumedAt: new Date(), lastUsedAt: new Date() },
    });
    return tx.session.create({
      data: {
        userId: current.userId,
        familyId: current.familyId,
        parentId: current.id,
        tokenHash: hashToken(nextToken),
        expiresAt: refreshExpiresAt,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
      },
    });
  });
  const access = await signAccessToken({
    userId: current.userId,
    profileId: current.user.profile.id,
    sessionId: next.id,
  });
  const identity = await publicUser(current.userId);
  return {
    accessToken: access.token,
    refreshToken: nextToken,
    accessExpiresAt: access.expiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    ...identity,
  };
}

export async function verifyAccessToken(token: string): Promise<AuthContext> {
  const { payload } = await jwtVerify(token, jwtKey(), {
    issuer: env.authIssuer,
    audience: "job-hunt-os-native",
  });
  if (!payload.sub || typeof payload.profileId !== "string" || typeof payload.sid !== "string") {
    throw new Error("invalid_access_token");
  }
  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    select: { revokedAt: true, consumedAt: true, expiresAt: true, user: { select: { status: true } } },
  });
  if (!session || session.revokedAt || session.user.status !== "active") {
    throw new Error("revoked_access_token");
  }
  return { userId: payload.sub, profileId: payload.profileId, sessionId: payload.sid };
}

export async function revokeSessionFamily(sessionId: string) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) return;
  await prisma.session.updateMany({
    where: { familyId: session.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
