import { prisma } from "./db.js";
import { env } from "./env.js";

const LIMITS: Record<string, number> = {
  search: 50,
  parse: 20,
  classify: 200,
  packet: 40,
};

export async function assertQuota(profileId: string, kind: keyof typeof LIMITS) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await prisma.usageRecord.count({
    where: { profileId, kind, createdAt: { gte: since } },
  });
  if (used >= LIMITS[kind]) {
    throw Object.assign(new Error("quota_exceeded"), { status: 429, kind });
  }
}

export async function recordUsage(profileId: string, kind: string, units = 1) {
  await prisma.usageRecord.create({ data: { profileId, kind, units } });
}

export function quotaErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === "quota_exceeded") {
    return { error: "daily_quota_exceeded", kind: (error as { kind?: string }).kind };
  }
  return null;
}

export const gmailPublicEnabled =
  env.nodeEnv !== "production" || env.gmailPublicEnabled;
