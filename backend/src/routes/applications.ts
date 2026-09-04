import { Hono } from "hono";
import { prisma, ensureProfile } from "../db.js";

export const applicationRoutes = new Hono();

applicationRoutes.get("/", async (c) => {
  const profile = await ensureProfile();
  const applications = await prisma.application.findMany({
    where: { profileId: profile.id },
    orderBy: { updatedAt: "desc" },
    include: { mailEvents: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
  return c.json({ applications });
});

applicationRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    status?: string;
    notes?: string;
    company?: string;
    jobTitle?: string;
  }>();
  const application = await prisma.application.update({
    where: { id },
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
  const profile = await ensureProfile();
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
  return c.json({
    totals: { applications: applications.length, mailEvents: events.length },
    byStatus,
    byClassification: byClass,
  });
});
