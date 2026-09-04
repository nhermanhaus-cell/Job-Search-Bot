import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env.js";
import { ensureProfile, prisma } from "./db.js";
import { dashboardHtml } from "./dashboard.js";
import { applicationRoutes } from "./routes/applications.js";
import { jobRoutes } from "./routes/jobs.js";
import { mailRoutes } from "./routes/mail.js";
import { profileRoutes } from "./routes/profile.js";
import { searchRoutes } from "./routes/search.js";
import { statsRoutes } from "./routes/stats.js";
import { googleConfigured } from "./mail/gmail.js";

export const app = new Hono();
app.use("*", cors());

app.get("/", (c) => c.html(dashboardHtml()));
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    model: env.openaiModel,
    googleConfigured: googleConfigured(),
  }),
);
app.route("/api/mail", mailRoutes);
app.route("/api/applications", applicationRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/jobs", jobRoutes);
app.route("/api/stats", statsRoutes);

app.get("/api/sync", async (c) => {
  const profile = await ensureProfile();
  const [applications, mailEvents, accounts, matches, titleInterests, experienceItems, skills] =
    await Promise.all([
    prisma.application.findMany({ where: { profileId: profile.id }, orderBy: { updatedAt: "desc" } }),
    prisma.mailEvent.findMany({ where: { profileId: profile.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.mailAccount.findMany({ where: { profileId: profile.id } }),
    prisma.match.findMany({
      where: { profileId: profile.id, hidden: false },
      include: { job: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    prisma.titleInterest.findMany({ where: { profileId: profile.id } }),
    prisma.experienceItem.findMany({ where: { profileId: profile.id } }),
    prisma.skill.findMany({ where: { profileId: profile.id } }),
  ]);
  return c.json({
    profile,
    applications,
    mailEvents,
    jobs: matches.map((match) => ({ job: match.job, match })),
    titleInterests,
    experienceItems,
    skills,
    mailAccounts: accounts.map(({ refreshTokenEnc: _r, accessTokenEnc: _a, ...rest }) => rest),
    openaiModel: env.openaiModel,
  });
});
