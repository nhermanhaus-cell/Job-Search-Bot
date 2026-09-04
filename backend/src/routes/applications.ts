import { Hono } from "hono";
import { prisma, profileFor } from "../db.js";

export const applicationRoutes = new Hono();

applicationRoutes.get("/", async (c) => {
  const profile = await profileFor(c);
  const applications = await prisma.application.findMany({
    where: { profileId: profile.id },
    orderBy: { updatedAt: "desc" },
    include: { mailEvents: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
  return c.json({ applications });
});

applicationRoutes.patch("/:id", async (c) => {
  const profile = await profileFor(c);
  const id = c.req.param("id");
  const body = await c.req.json<{
    status?: string;
    notes?: string;
    company?: string;
    jobTitle?: string;
  }>();
  const owned = await prisma.application.findFirst({ where: { id, profileId: profile.id } });
  if (!owned) return c.json({ error: "not found" }, 404);
  const application = await prisma.application.update({
    where: { id: owned.id },
    data: {
      status: body.status,
      notes: body.notes,
      company: body.company,
      jobTitle: body.jobTitle,
      closedAt: body.status === "rejected" || body.status === "closed" ? new Date() : undefined,
    },
  });
  return c.json({ application });
});

applicationRoutes.get("/stats", async (c) => {
  const profile = await profileFor(c);
  const applications = await prisma.application.findMany({ where: { profileId: profile.id } });
  const byStatus: Record<string, number> = {};
  for (const app of applications) {
    byStatus[app.status] = (byStatus[app.status] ?? 0) + 1;
  }
  const events = await prisma.mailEvent.findMany({
    where: { profileId: profile.id, reviewState: { not: "ignored" } },
  });
  const byClass: Record<string, number> = {};
  for (const ev of events) {
    byClass[ev.classification] = (byClass[ev.classification] ?? 0) + 1;
  }
  const seriesMap = new Map<string, { date: string; applications: number; interviews: number }>();
  for (const app of applications) {
    const date = (app.submittedAt ?? app.appliedAt ?? app.createdAt).toISOString().slice(0, 10);
    const row = seriesMap.get(date) ?? { date, applications: 0, interviews: 0 };
    row.applications += 1;
    if (app.status === "interview" || app.status === "offer") row.interviews += 1;
    seriesMap.set(date, row);
  }
  return c.json({
    totals: { applications: applications.length, mailEvents: events.length },
    byStatus,
    byClassification: byClass,
    series: [...seriesMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
  });
});
