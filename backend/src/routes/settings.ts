import { Hono } from "hono";
import { profileFor, prisma } from "../db.js";
import { env } from "../env.js";
import { providers } from "../jobs/providers.js";

export const settingsRoutes = new Hono();

settingsRoutes.get("/", async (c) => {
  const profile = await profileFor(c);
  return c.json({
    enabledSources: JSON.parse(profile.enabledSourcesJson) as string[],
    mailPollMinutes: profile.mailPollMinutes,
    sources: [...providers.values()].map((provider) => ({
      id: provider.name,
      configured: provider.configured(),
      missingReason: provider.configured() ? null : provider.missingReason,
    })),
    secrets: {
      openai: Boolean(env.openaiApiKey),
    },
  });
});

settingsRoutes.patch("/", async (c) => {
  const profile = await profileFor(c);
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
  return c.json({ error: "OpenAI is managed by the service in production" }, 403);
});

settingsRoutes.delete("/openai-key", async (c) => {
  return c.json({ error: "OpenAI is managed by the service in production" }, 403);
});

export async function loadServerSecrets() {
  return;
}
