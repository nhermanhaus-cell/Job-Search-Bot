import { Hono } from "hono";
import { profileFor, prisma } from "../db.js";
import { env } from "../env.js";
import { joinBoardList, mergeBoardLists, parseBoardList } from "../jobs/atsBoards.js";
import { providers } from "../jobs/providers.js";

function atsStatus(
  name: "greenhouse" | "lever" | "ashby",
  profile: { greenhouseBoards: string; leverSites: string; ashbyBoards: string },
) {
  const boards =
    name === "greenhouse"
      ? mergeBoardLists(env.greenhouseBoards, profile.greenhouseBoards)
      : name === "lever"
        ? mergeBoardLists(env.leverSites, profile.leverSites)
        : mergeBoardLists(env.ashbyBoards, profile.ashbyBoards);
  const label =
    name === "greenhouse" ? "Greenhouse board URLs or slugs" : name === "lever" ? "Lever careers URLs or slugs" : "Ashby careers URLs or slugs";
  return {
    configured: boards.length > 0,
    missingReason: boards.length ? null : `Add ${label} in Settings`,
  };
}

export const settingsRoutes = new Hono();

settingsRoutes.get("/", async (c) => {
  const profile = await profileFor(c);
  return c.json({
    enabledSources: JSON.parse(profile.enabledSourcesJson) as string[],
    mailPollMinutes: profile.mailPollMinutes,
    greenhouseBoards: joinBoardList(mergeBoardLists(env.greenhouseBoards, profile.greenhouseBoards)),
    leverSites: joinBoardList(mergeBoardLists(env.leverSites, profile.leverSites)),
    ashbyBoards: joinBoardList(mergeBoardLists(env.ashbyBoards, profile.ashbyBoards)),
    sources: [...providers.values()].map((provider) => {
      const ats =
        provider.name === "greenhouse" || provider.name === "lever" || provider.name === "ashby"
          ? atsStatus(provider.name, profile)
          : null;
      return {
        id: provider.name,
        configured: ats ? ats.configured : provider.configured(),
        missingReason: ats ? ats.missingReason : provider.configured() ? null : provider.missingReason,
      };
    }),
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
    greenhouseBoards?: string;
    leverSites?: string;
    ashbyBoards?: string;
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
      greenhouseBoards:
        body.greenhouseBoards !== undefined ? joinBoardList(parseBoardList(body.greenhouseBoards)) : undefined,
      leverSites: body.leverSites !== undefined ? joinBoardList(parseBoardList(body.leverSites)) : undefined,
      ashbyBoards: body.ashbyBoards !== undefined ? joinBoardList(parseBoardList(body.ashbyBoards)) : undefined,
    },
  });
  return c.json({
    enabledSources: JSON.parse(updated.enabledSourcesJson),
    mailPollMinutes: updated.mailPollMinutes,
    greenhouseBoards: updated.greenhouseBoards,
    leverSites: updated.leverSites,
    ashbyBoards: updated.ashbyBoards,
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
