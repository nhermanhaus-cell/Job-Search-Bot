import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env.js";
import { profileFor, prisma } from "./db.js";
import { dashboardHtml } from "./dashboard.js";
import { applicationRoutes } from "./routes/applications.js";
import { jobRoutes } from "./routes/jobs.js";
import { mailRoutes } from "./routes/mail.js";
import { profileRoutes } from "./routes/profile.js";
import { searchRoutes } from "./routes/search.js";
import { statsRoutes } from "./routes/stats.js";
import { settingsRoutes } from "./routes/settings.js";
import { googleConfigured } from "./mail/gmail.js";
import { protectAPI, type APIEnv } from "./auth/middleware.js";
import { authRoutes } from "./routes/auth.js";
import { privacyHtml, termsHtml } from "./legal.js";
import { logger, requestId } from "./logger.js";
import { pingStorage } from "./storage/index.js";

export const app = new Hono<APIEnv>();
app.use(
  "*",
  cors({
    origin: (origin) =>
      !origin || env.nodeEnv !== "production" || env.allowedOrigins.includes(origin) ? origin : "",
  }),
);
app.use("*", async (c, next) => {
  const id = c.req.header("x-request-id") || requestId();
  c.header("x-request-id", id);
  const started = Date.now();
  await next();
  logger.info({
    requestId: id,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    ms: Date.now() - started,
  });
});

app.get("/", (c) =>
  env.nodeEnv === "production" ? c.json({ service: "job-hunt-os" }) : c.html(dashboardHtml()),
);
app.get("/privacy", (c) => c.html(privacyHtml));
app.get("/terms", (c) => c.html(termsHtml));
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    model: env.openaiModel,
    googleConfigured: googleConfigured(),
  }),
);
app.get("/api/health/live", (c) => c.json({ ok: true }));
app.get("/api/health/ready", async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const storage = await pingStorage();
    if (!storage) return c.json({ ok: false, database: "ready", storage: "unavailable" }, 503);
    return c.json({ ok: true, database: "ready", storage: "ready" });
  } catch {
    return c.json({ ok: false, database: "unavailable" }, 503);
  }
});
app.route("/api/auth", authRoutes);
app.use("/api/*", protectAPI);
app.route("/api/mail", mailRoutes);
app.route("/api/applications", applicationRoutes);
app.route("/api/profile", profileRoutes);
app.route("/api/intake", profileRoutes);
app.route("/api/search", searchRoutes);
app.route("/api/jobs", jobRoutes);
app.route("/api/stats", statsRoutes);
app.route("/api/settings", settingsRoutes);

app.get("/api/sync", async (c) => {
  const profile = await profileFor(c);
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
