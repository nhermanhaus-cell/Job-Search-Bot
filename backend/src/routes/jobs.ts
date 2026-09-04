import { createHash } from "node:crypto";
import { Hono } from "hono";
import { ensureProfile, prisma } from "../db.js";
import { deepRead } from "../jobs/match.js";
import { storeAndMatch } from "../jobs/search.js";

export const jobRoutes = new Hono();

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function shapeJob(job: Awaited<ReturnType<typeof loadJob>>) {
  if (!job) return null;
  return {
    ...job,
    requirements: parseJson(job.requirementsJson, {}),
    sources: parseJson(job.sourcesJson, []),
    matches: job.matches.map((match) => ({
      ...match,
      breakdown: parseJson(match.breakdownJson, {}),
      hiddenMisses: parseJson(match.hiddenMisses, []),
      effectiveDifficulty: match.userDifficulty ?? match.difficulty,
    })),
  };
}

function loadJob(id: string) {
  return prisma.job.findUnique({
    where: { id },
    include: {
      matches: true,
      suggestions: { orderBy: { createdAt: "asc" } },
      resumeVersions: { orderBy: { createdAt: "desc" } },
    },
  });
}

jobRoutes.get("/", async (c) => {
  const profile = await ensureProfile();
  const difficulty = c.req.query("difficulty");
  const matches = await prisma.match.findMany({
    where: {
      profileId: profile.id,
      hidden: false,
      ...(difficulty
        ? {
            OR: [
              { userDifficulty: difficulty },
              { userDifficulty: null, difficulty },
            ],
          }
        : {}),
    },
    include: { job: true },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return c.json({
    jobs: matches.map((match) => ({
      ...match.job,
      requirements: parseJson(match.job.requirementsJson, {}),
      sources: parseJson(match.job.sourcesJson, []),
      match: {
        ...match,
        breakdown: parseJson(match.breakdownJson, {}),
        hiddenMisses: parseJson(match.hiddenMisses, []),
        effectiveDifficulty: match.userDifficulty ?? match.difficulty,
      },
    })),
  });
});

jobRoutes.post("/paste", async (c) => {
  const profile = await ensureProfile();
  const body = await c.req.json<{
    title: string;
    company?: string;
    description: string;
    listingUrl?: string;
  }>();
  if (!body.title || !body.description) return c.json({ error: "title and description required" }, 400);
  const id = createHash("sha1").update(body.description).digest("hex");
  const result = await storeAndMatch(profile.id, {
    provider: "paste",
    providerJobId: id,
    title: body.title,
    company: body.company || "Pasted job",
    description: body.description,
    listingUrl: body.listingUrl || `local://job/${id}`,
  });
  return c.json(result, 201);
});

jobRoutes.get("/:id", async (c) => {
  const job = await loadJob(c.req.param("id"));
  if (!job) return c.json({ error: "not found" }, 404);
  if (!job.suggestions.length) await ensureSuggestions(job.id);
  return c.json({ job: shapeJob(await loadJob(job.id)) });
});

jobRoutes.patch("/:id/match", async (c) => {
  const profile = await ensureProfile();
  const body = await c.req.json<{ difficulty?: string; hidden?: boolean }>();
  const match = await prisma.match.update({
    where: { profileId_jobId: { profileId: profile.id, jobId: c.req.param("id") } },
    data: {
      userDifficulty: body.difficulty,
      hidden: body.hidden,
    },
  });
  return c.json({ match });
});

jobRoutes.patch("/:id/suggestions/:suggestionId", async (c) => {
  const body = await c.req.json<{ status: "accepted" | "rejected" | "pending"; afterText?: string }>();
  const suggestion = await prisma.editSuggestion.update({
    where: { id: c.req.param("suggestionId") },
    data: { status: body.status, afterText: body.afterText },
  });
  return c.json({ suggestion });
});

jobRoutes.post("/:id/resume-versions", async (c) => {
  const profile = await ensureProfile();
  const job = await loadJob(c.req.param("id"));
  if (!job) return c.json({ error: "not found" }, 404);
  const body: { status?: string } = await c.req.json<{ status?: string }>().catch(() => ({}));
  const experience = await prisma.experienceItem.findMany({ where: { profileId: profile.id } });
  const skills = await prisma.skill.findMany({ where: { profileId: profile.id } });
  const accepted = job.suggestions.filter((suggestion) => suggestion.status === "accepted");
  const content = {
    name: profile.name,
    email: profile.email,
    summary:
      accepted.find((item) => item.section === "summary")?.afterText ??
      profile.summary ??
      `Candidate for ${job.title}`,
    skills: [
      ...new Set([
        ...accepted.filter((item) => item.section === "skills").map((item) => item.afterText),
        ...skills.map((skill) => skill.name),
      ]),
    ],
    experience: experience.map((item) => ({
      company: item.company,
      title: item.title,
      dates: [item.startDate, item.endDate].filter(Boolean).join(" – "),
      bullets: parseJson<string[]>(item.bulletsJson, []),
    })),
    target: { jobId: job.id, title: job.title, company: job.company },
  };
  const version = await prisma.resumeVersion.create({
    data: {
      profileId: profile.id,
      jobId: job.id,
      contentJson: JSON.stringify(content),
      status: body.status || "draft",
    },
  });
  return c.json({ version: { ...version, content } }, 201);
});

jobRoutes.get("/:id/packet", async (c) => {
  const profile = await ensureProfile();
  const job = await loadJob(c.req.param("id"));
  if (!job) return c.json({ error: "not found" }, 404);
  const version =
    job.resumeVersions[0] ??
    (await prisma.resumeVersion.create({
      data: {
        profileId: profile.id,
        jobId: job.id,
        contentJson: JSON.stringify({
          name: profile.name,
          email: profile.email,
          summary: profile.summary,
          target: { title: job.title, company: job.company },
        }),
      },
    }));
  c.header("Content-Disposition", `attachment; filename="${job.company}-${job.title}.json"`);
  return c.body(version.contentJson, 200, { "Content-Type": "application/json" });
});

jobRoutes.post("/:id/apply", async (c) => {
  const profile = await ensureProfile();
  const job = await prisma.job.findUnique({ where: { id: c.req.param("id") } });
  if (!job) return c.json({ error: "not found" }, 404);
  const existing = await prisma.application.findFirst({
    where: { profileId: profile.id, listingUrl: job.listingUrl },
  });
  const application = existing
    ? await prisma.application.update({
        where: { id: existing.id },
        data: { status: "opened", openedAt: new Date() },
      })
    : await prisma.application.create({
        data: {
          profileId: profile.id,
          company: job.company,
          jobTitle: job.title,
          status: "opened",
          source: "in_app",
          listingUrl: job.listingUrl,
          openedAt: new Date(),
        },
      });
  return c.json({ application });
});

async function ensureSuggestions(jobId: string) {
  const profile = await ensureProfile();
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const requirements = deepRead(job.description, job.title);
  const skills = await prisma.skill.findMany({ where: { profileId: profile.id } });
  const profileSkills = new Set(skills.map((skill) => skill.name.toLowerCase()));
  const suggestions = requirements.requiredSkills
    .filter((skill) => profileSkills.has(skill))
    .slice(0, 5)
    .map((skill) => ({
      jobId,
      kind: "promote",
      section: "skills",
      afterText: skill,
      rationale: `${job.company} names ${skill} in the description and it already exists in your background.`,
    }));
  suggestions.unshift({
    jobId,
    kind: "retitle",
    section: "summary",
    afterText: `${job.title} with experience aligned to ${job.company}'s stated priorities.`,
    rationale: "Lead with the target title while keeping experience claims grounded in your profile.",
  });
  await prisma.editSuggestion.createMany({ data: suggestions });
}
