import { Hono } from "hono";
import { decryptSecret, encryptSecret } from "../crypto.js";
import { ensureProfile, prisma } from "../db.js";
import { env } from "../env.js";
import { providers } from "../jobs/providers.js";

export const settingsRoutes = new Hono();

settingsRoutes.get("/", async (c) => {
  const profile = await ensureProfile();
  const secrets = await prisma.serverSecret.findMany({
    where: { profileId: profile.id },
    select: { name: true, updatedAt: true },
  });
  return c.json({
    enabledSources: JSON.parse(profile.enabledSourcesJson) as string[],
    mailPollMinutes: profile.mailPollMinutes,
    sources: [...providers.values()].map((provider) => ({
      id: provider.name,
      configured: provider.configured(),
      missingReason: provider.configured() ? null : provider.missingReason,
    })),
    secrets: {
      openai: secrets.some((secret) => secret.name === "OPENAI_API_KEY") || Boolean(env.openaiApiKey),
    },
  });
});

settingsRoutes.patch("/", async (c) => {
  const profile = await ensureProfile();
  const body = await c.req.json<{
    enabledSources?: string[];
    mailPollMinutes?: number;
  }>();
  const updated = await prisma.profile.update({
    where: { id: profile.id },
    data: {
      enabledSourcesJson: body.enabledSources
        ? JSON.stringify(body.enabledSources)
        : undefined,
      mailPollMinutes: body.mailPollMinutes
        ? Math.max(5, Math.min(120, body.mailPollMinutes))
        : undefined,
    },
  });
  return c.json({
    enabledSources: JSON.parse(updated.enabledSourcesJson),
    mailPollMinutes: updated.mailPollMinutes,
  });
});

settingsRoutes.put("/openai-key", async (c) => {
  const profile = await ensureProfile();
  const body = await c.req.json<{ apiKey: string }>();
  if (!body.apiKey?.startsWith("sk-")) return c.json({ error: "Enter a valid OpenAI API key" }, 400);
  await prisma.serverSecret.upsert({
    where: { profileId_name: { profileId: profile.id, name: "OPENAI_API_KEY" } },
    create: {
      profileId: profile.id,
      name: "OPENAI_API_KEY",
      valueEnc: encryptSecret(body.apiKey),
    },
    update: { valueEnc: encryptSecret(body.apiKey) },
  });
  env.openaiApiKey = body.apiKey;
  return c.json({ configured: true });
});

settingsRoutes.delete("/openai-key", async (c) => {
  const profile = await ensureProfile();
  await prisma.serverSecret.deleteMany({
    where: { profileId: profile.id, name: "OPENAI_API_KEY" },
  });
  env.openaiApiKey = "";
  return c.json({ configured: false });
});

export async function loadServerSecrets() {
  const profile = await ensureProfile();
  const secret = await prisma.serverSecret.findUnique({
    where: { profileId_name: { profileId: profile.id, name: "OPENAI_API_KEY" } },
  });
  if (secret) env.openaiApiKey = decryptSecret(secret.valueEnc);
}
