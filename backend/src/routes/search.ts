import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { ensureProfile, prisma } from "../db.js";
import { providers } from "../jobs/providers.js";
import { createSearchSession, feedFor } from "../jobs/search.js";

export const searchRoutes = new Hono();

searchRoutes.post("/sessions", async (c) => {
  const profile = await ensureProfile();
  const body = await c.req.json<{
    query: string;
    location?: string;
    remote?: boolean;
    sources?: string[];
  }>();
  if (!body.query?.trim()) return c.json({ error: "query required" }, 400);
  const session = await createSearchSession(
    profile.id,
    { query: body.query.trim(), location: body.location, remote: body.remote },
    body.sources,
  );
  return c.json({ session }, 201);
});

searchRoutes.get("/sessions/:id", async (c) => {
  const session = await prisma.searchSession.findUnique({
    where: { id: c.req.param("id") },
    include: { sourceRuns: true },
  });
  if (!session) return c.json({ error: "not found" }, 404);
  return c.json({ session });
});

searchRoutes.get("/sessions/:id/events", async (c) => {
  const sessionId = c.req.param("id");
  const feed = feedFor(sessionId);
  if (!feed) {
    const session = await prisma.searchSession.findUnique({ where: { id: sessionId } });
    if (!session) return c.json({ error: "not found" }, 404);
    return c.json({ error: "Live feed expired; sync persisted matches instead" }, 410);
  }
  return streamSSE(c, async (stream) => {
    let index = 0;
    while (true) {
      while (index < feed.events.length) {
        const event = feed.events[index++];
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
          id: String(index),
        });
      }
      if (feed.done) break;
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          feed.emitter.off("event", done);
          resolve();
        }, 1_000);
        feed.emitter.once("event", done);
      });
    }
  });
});

searchRoutes.get("/sources", (c) =>
  c.json({
    sources: [...providers.values()].map((provider) => ({
      id: provider.name,
      name: provider.name
        .replace("remoteok", "Remote OK")
        .replace("usajobs", "USAJobs")
        .replace("jsearch", "JSearch / Google Jobs")
        .replace(/^./, (value) => value.toUpperCase()),
      configured: provider.configured(),
      missingReason: provider.configured() ? null : provider.missingReason,
    })),
  }),
);
