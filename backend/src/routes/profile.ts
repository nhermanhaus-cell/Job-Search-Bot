import { Hono } from "hono";
import { ensureProfile, prisma } from "../db.js";
import { adjacentTitles, extractResumeText, parseResume } from "../intake/resume.js";

export const profileRoutes = new Hono();

function json<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

profileRoutes.get("/", async (c) => {
  const base = await ensureProfile();
  const profile = await prisma.profile.findUniqueOrThrow({
    where: { id: base.id },
    include: {
      resumeDocuments: { orderBy: { uploadedAt: "desc" } },
      experienceItems: { orderBy: { startDate: "desc" } },
      skills: { orderBy: { confidence: "desc" } },
      titleInterests: { orderBy: { createdAt: "asc" } },
    },
  });
  return c.json({
    profile: {
      ...profile,
      experienceItems: profile.experienceItems.map((item) => ({
        ...item,
        bullets: json<string[]>(item.bulletsJson, []),
        sourceDocumentIds: json<string[]>(item.sourceDocumentIds, []),
      })),
      skills: profile.skills.map((skill) => ({
        ...skill,
        aliases: json<string[]>(skill.aliasesJson, []),
        sourceDocumentIds: json<string[]>(skill.sourceDocumentIds, []),
      })),
      resumeDocuments: profile.resumeDocuments.map(({ rawText: _text, ...document }) => document),
    },
  });
});

profileRoutes.patch("/", async (c) => {
  const base = await ensureProfile();
  const body = await c.req.json<{
    name?: string;
    email?: string;
    location?: string;
    remotePreference?: string;
    maxYearsRequired?: number;
    summary?: string;
    onboardingDone?: boolean;
  }>();
  const profile = await prisma.profile.update({
    where: { id: base.id },
    data: body,
  });
  return c.json({ profile });
});

profileRoutes.post("/resumes", async (c) => {
  const profile = await ensureProfile();
  const body = await c.req.parseBody({ all: true });
  const rawFiles = body.files;
  const files = (Array.isArray(rawFiles) ? rawFiles : rawFiles ? [rawFiles] : []).filter(
    (value): value is File => value instanceof File,
  );
  if (!files.length) return c.json({ error: "Upload at least one file in the files field" }, 400);

  const results = [];
  for (const file of files) {
    const rawText = await extractResumeText(file);
    const parsed = await parseResume(rawText);
    const document = await prisma.resumeDocument.create({
      data: {
        profileId: profile.id,
        fileName: file.name,
        mediaType: file.type || "text/plain",
        rawText,
        parseJson: JSON.stringify(parsed),
      },
    });

    await prisma.profile.update({
      where: { id: profile.id },
      data: {
        name: parsed.name ?? undefined,
        email: parsed.email ?? undefined,
        location: parsed.location ?? undefined,
        summary: parsed.summary ?? undefined,
      },
    });

    for (const item of parsed.experiences) {
      const existing = await prisma.experienceItem.findFirst({
        where: {
          profileId: profile.id,
          company: { equals: item.company },
          title: { equals: item.title },
        },
      });
      if (existing) {
        const bullets = [
          ...new Set([...json<string[]>(existing.bulletsJson, []), ...item.bullets]),
        ];
        const sourceIds = [
          ...new Set([...json<string[]>(existing.sourceDocumentIds, []), document.id]),
        ];
        await prisma.experienceItem.update({
          where: { id: existing.id },
          data: {
            bulletsJson: JSON.stringify(bullets),
            sourceDocumentIds: JSON.stringify(sourceIds),
            startDate: existing.startDate ?? item.startDate,
            endDate: existing.endDate ?? item.endDate,
          },
        });
      } else {
        await prisma.experienceItem.create({
          data: {
            profileId: profile.id,
            company: item.company,
            title: item.title,
            startDate: item.startDate,
            endDate: item.endDate,
            location: item.location,
            bulletsJson: JSON.stringify(item.bullets),
            sourceDocumentIds: JSON.stringify([document.id]),
          },
        });
      }
    }

    for (const name of parsed.skills) {
      if (!name.trim()) continue;
      await prisma.skill.upsert({
        where: { profileId_name: { profileId: profile.id, name: name.trim() } },
        create: {
          profileId: profile.id,
          name: name.trim(),
          sourceDocumentIds: JSON.stringify([document.id]),
        },
        update: {},
      });
    }

    const titleCandidates = [
      ...parsed.titleSuggestions,
      ...parsed.experiences.flatMap((item) =>
        adjacentTitles(item.title).map((title) => ({
          title,
          reason: `Adjacent to your ${item.title} experience`,
        })),
      ),
    ];
    for (const candidate of titleCandidates) {
      await prisma.titleInterest.upsert({
        where: { profileId_title: { profileId: profile.id, title: candidate.title } },
        create: {
          profileId: profile.id,
          title: candidate.title,
          reason: candidate.reason,
          pinned: false,
          source: "suggested",
        },
        update: {},
      });
    }
    results.push({ documentId: document.id, fileName: file.name, parsed });
  }
  return c.json({ results }, 201);
});

profileRoutes.post("/titles", async (c) => {
  const profile = await ensureProfile();
  const body = await c.req.json<{ title: string; pinned?: boolean; reason?: string }>();
  if (!body.title?.trim()) return c.json({ error: "title required" }, 400);
  const interest = await prisma.titleInterest.upsert({
    where: { profileId_title: { profileId: profile.id, title: body.title.trim() } },
    create: {
      profileId: profile.id,
      title: body.title.trim(),
      pinned: body.pinned ?? true,
      reason: body.reason,
      source: "user",
    },
    update: { pinned: body.pinned ?? true },
  });
  return c.json({ interest }, 201);
});

profileRoutes.patch("/titles/:id", async (c) => {
  const body = await c.req.json<{ pinned?: boolean; title?: string }>();
  const interest = await prisma.titleInterest.update({
    where: { id: c.req.param("id") },
    data: body,
  });
  return c.json({ interest });
});

profileRoutes.delete("/titles/:id", async (c) => {
  await prisma.titleInterest.delete({ where: { id: c.req.param("id") } });
  return c.json({ ok: true });
});

profileRoutes.post("/experience", async (c) => {
  const profile = await ensureProfile();
  const body = await c.req.json<{
    company: string;
    title: string;
    startDate?: string;
    endDate?: string;
    location?: string;
    bullets?: string[];
  }>();
  const item = await prisma.experienceItem.create({
    data: {
      profileId: profile.id,
      company: body.company,
      title: body.title,
      startDate: body.startDate,
      endDate: body.endDate,
      location: body.location,
      bulletsJson: JSON.stringify(body.bullets ?? []),
      sourceDocumentIds: "[]",
    },
  });
  return c.json({ item }, 201);
});

profileRoutes.patch("/experience/:id", async (c) => {
  const body = await c.req.json<{
    company?: string;
    title?: string;
    startDate?: string;
    endDate?: string;
    location?: string;
    bullets?: string[];
  }>();
  const { bullets, ...fields } = body;
  const item = await prisma.experienceItem.update({
    where: { id: c.req.param("id") },
    data: {
      ...fields,
      bulletsJson: bullets ? JSON.stringify(bullets) : undefined,
    },
  });
  return c.json({ item });
});

profileRoutes.delete("/experience/:id", async (c) => {
  await prisma.experienceItem.delete({ where: { id: c.req.param("id") } });
  return c.json({ ok: true });
});

profileRoutes.post("/skills", async (c) => {
  const profile = await ensureProfile();
  const body = await c.req.json<{ name: string }>();
  const skill = await prisma.skill.upsert({
    where: { profileId_name: { profileId: profile.id, name: body.name.trim() } },
    create: { profileId: profile.id, name: body.name.trim() },
    update: {},
  });
  return c.json({ skill }, 201);
});

profileRoutes.delete("/skills/:id", async (c) => {
  await prisma.skill.delete({ where: { id: c.req.param("id") } });
  return c.json({ ok: true });
});
