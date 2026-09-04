import { bodyLimit } from "hono/body-limit";
import { Hono } from "hono";
import { profileFor, prisma } from "../db.js";
import { env } from "../env.js";
import { applyParsedResume } from "../intake/apply.js";
import { detectResumeMedia } from "../intake/magic.js";
import { extractResumeBytes, parseResume } from "../intake/resume.js";
import { completeJob, enqueue } from "../queue/index.js";
import { handleParseResume } from "../queue/handlers.js";
import { putEncryptedObject } from "../storage/index.js";
import { assertQuota, quotaErrorResponse, recordUsage } from "../usage.js";

export const profileRoutes = new Hono();

function json<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

profileRoutes.get("/", async (c) => {
  const base = await profileFor(c);
  const profile = await prisma.profile.findUniqueOrThrow({
    where: { id: base.id },
    include: {
      resumeDocuments: { orderBy: { uploadedAt: "desc" } },
      experienceItems: { orderBy: { startDate: "desc" } },
      skills: { orderBy: { confidence: "desc" } },
      titleInterests: { orderBy: { createdAt: "asc" } },
      profileConflicts: { where: { status: "pending" }, orderBy: { createdAt: "asc" } },
    },
  });
  return c.json({
    profile: {
      ...profile,
      enabledSources: json<string[]>(profile.enabledSourcesJson, []),
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
      profileConflicts: profile.profileConflicts.map((conflict) => ({
        ...conflict,
        options: json<string[]>(conflict.optionsJson, []),
      })),
    },
  });
});

profileRoutes.patch("/", async (c) => {
  const base = await profileFor(c);
  const body = await c.req.json<{
    name?: string;
    email?: string;
    location?: string;
    remotePreference?: string;
    maxYearsRequired?: number;
    summary?: string;
    onboardingDone?: boolean;
    enabledSources?: string[];
    mailPollMinutes?: number;
  }>();
  const { enabledSources, ...fields } = body;
  const profile = await prisma.profile.update({
    where: { id: base.id },
    data: {
      ...fields,
      enabledSourcesJson: enabledSources ? JSON.stringify(enabledSources) : undefined,
    },
  });
  return c.json({ profile });
});

profileRoutes.use(
  "/resumes",
  bodyLimit({
    maxSize: 12 * 1024 * 1024,
    onError: (c) => c.json({ error: "file_too_large" }, 413),
  }),
);

profileRoutes.post("/resumes", async (c) => {
  const profile = await profileFor(c);
  try {
    await assertQuota(profile.id, "parse");
  } catch (error) {
    const quota = quotaErrorResponse(error);
    if (quota) return c.json(quota, 429);
    throw error;
  }
  const body = await c.req.parseBody({ all: true });
  const rawFiles = body.files;
  const files = (Array.isArray(rawFiles) ? rawFiles : rawFiles ? [rawFiles] : []).filter(
    (value): value is File => value instanceof File,
  );
  if (!files.length) return c.json({ error: "Upload at least one file in the files field" }, 400);

  const results = [];
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const media = detectResumeMedia(file.name, bytes);
    if (!media) return c.json({ error: `unsupported_or_invalid_file:${file.name}` }, 400);

    const stored = await putEncryptedObject({
      profileId: profile.id,
      kind: "resume",
      originalName: file.name,
      contentType: media.mediaType,
      bytes,
    });
    const document = await prisma.resumeDocument.create({
      data: {
        profileId: profile.id,
        objectId: stored.id,
        fileName: file.name,
        mediaType: media.mediaType,
        parseJson: "{}",
        parseStatus: "queued",
      },
    });
    const job = await enqueue(
      "parse_resume",
      { documentId: document.id, profileId: profile.id },
      { profileId: profile.id, dedupeKey: `parse:${document.id}` },
    );
    await recordUsage(profile.id, "parse");

    if (env.nodeEnv !== "production") {
      try {
        if (process.env.INLINE_PARSE !== "0") {
          const rawText = await extractResumeBytes(bytes, file.name, media.mediaType);
          const parsed = await parseResume(rawText);
          await applyParsedResume(profile.id, document.id, parsed);
          await prisma.resumeDocument.update({
            where: { id: document.id },
            data: { parseJson: JSON.stringify(parsed), parseStatus: "ready", rawText: null },
          });
          await completeJob(job.id);
          results.push({ documentId: document.id, fileName: file.name, parsed, parseStatus: "ready" });
          continue;
        }
        await handleParseResume({
          id: job.id,
          type: "parse_resume",
          profileId: profile.id,
          payloadJson: job.payloadJson,
          attempts: 1,
          maxAttempts: 5,
        });
        await completeJob(job.id);
      } catch (error) {
        await prisma.resumeDocument.update({
          where: { id: document.id },
          data: { parseStatus: "error" },
        });
        throw error;
      }
    }
    results.push({ documentId: document.id, fileName: file.name, parseStatus: "queued" });
  }
  return c.json({ results }, 201);
});

profileRoutes.post("/titles", async (c) => {
  const profile = await profileFor(c);
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
  const profile = await profileFor(c);
  const body = await c.req.json<{ pinned?: boolean; title?: string }>();
  const owned = await prisma.titleInterest.findFirst({
    where: { id: c.req.param("id"), profileId: profile.id },
  });
  if (!owned) return c.json({ error: "not found" }, 404);
  const interest = await prisma.titleInterest.update({
    where: { id: owned.id },
    data: body,
  });
  return c.json({ interest });
});

profileRoutes.delete("/titles/:id", async (c) => {
  const profile = await profileFor(c);
  await prisma.titleInterest.deleteMany({ where: { id: c.req.param("id"), profileId: profile.id } });
  return c.json({ ok: true });
});

profileRoutes.post("/experience", async (c) => {
  const profile = await profileFor(c);
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
  const profile = await profileFor(c);
  const body = await c.req.json<{
    company?: string;
    title?: string;
    startDate?: string;
    endDate?: string;
    location?: string;
    bullets?: string[];
  }>();
  const { bullets, ...fields } = body;
  const owned = await prisma.experienceItem.findFirst({
    where: { id: c.req.param("id"), profileId: profile.id },
  });
  if (!owned) return c.json({ error: "not found" }, 404);
  const item = await prisma.experienceItem.update({
    where: { id: owned.id },
    data: {
      ...fields,
      bulletsJson: bullets ? JSON.stringify(bullets) : undefined,
    },
  });
  return c.json({ item });
});

profileRoutes.delete("/experience/:id", async (c) => {
  const profile = await profileFor(c);
  await prisma.experienceItem.deleteMany({ where: { id: c.req.param("id"), profileId: profile.id } });
  return c.json({ ok: true });
});

profileRoutes.post("/skills", async (c) => {
  const profile = await profileFor(c);
  const body = await c.req.json<{ name: string }>();
  const skill = await prisma.skill.upsert({
    where: { profileId_name: { profileId: profile.id, name: body.name.trim() } },
    create: { profileId: profile.id, name: body.name.trim() },
    update: {},
  });
  return c.json({ skill }, 201);
});

profileRoutes.delete("/skills/:id", async (c) => {
  const profile = await profileFor(c);
  await prisma.skill.deleteMany({ where: { id: c.req.param("id"), profileId: profile.id } });
  return c.json({ ok: true });
});

profileRoutes.post("/conflicts/:id/resolve", async (c) => {
  const profile = await profileFor(c);
  const body = await c.req.json<{ value: string }>();
  const conflict = await prisma.profileConflict.findFirst({
    where: { id: c.req.param("id"), profileId: profile.id },
  });
  if (!conflict) return c.json({ error: "not found" }, 404);
  const [, experienceId, field] = conflict.field.split(".");
  if (experienceId && (field === "startDate" || field === "endDate")) {
    await prisma.experienceItem.updateMany({
      where: { id: experienceId, profileId: profile.id },
      data: field === "startDate" ? { startDate: body.value } : { endDate: body.value },
    });
  }
  const resolved = await prisma.profileConflict.update({
    where: { id: conflict.id },
    data: { resolvedValue: body.value, status: "resolved" },
  });
  return c.json({ conflict: resolved });
});
