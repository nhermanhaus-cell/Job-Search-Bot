import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env.js";
import { ensureProfile, prisma } from "./db.js";
import { dashboardHtml } from "./dashboard.js";
import { applicationRoutes } from "./routes/applications.js";
import { mailRoutes } from "./routes/mail.js";
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

app.get("/api/sync", async (c) => {
  const profile = await ensureProfile();
  const [applications, mailEvents, accounts] = await Promise.all([
    prisma.application.findMany({ where: { profileId: profile.id }, orderBy: { updatedAt: "desc" } }),
    prisma.mailEvent.findMany({ where: { profileId: profile.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.mailAccount.findMany({ where: { profileId: profile.id } }),
  ]);
  return c.json({
    profile,
    applications,
    mailEvents,
    mailAccounts: accounts.map(({ refreshTokenEnc: _r, accessTokenEnc: _a, ...rest }) => rest),
    openaiModel: env.openaiModel,
  });
});
