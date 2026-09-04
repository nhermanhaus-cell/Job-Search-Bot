import { prisma } from "../db.js";
import { adjacentTitles, type ParsedResume } from "./resume.js";

function json<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function applyParsedResume(profileId: string, documentId: string, parsed: ParsedResume) {
  await prisma.profile.update({
    where: { id: profileId },
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
        profileId,
        company: { equals: item.company },
        title: { equals: item.title },
      },
    });
    if (existing) {
      const bullets = [...new Set([...json<string[]>(existing.bulletsJson, []), ...item.bullets])];
      const sourceIds = [...new Set([...json<string[]>(existing.sourceDocumentIds, []), documentId])];
      for (const [field, oldValue, newValue] of [
        ["startDate", existing.startDate, item.startDate],
        ["endDate", existing.endDate, item.endDate],
      ] as const) {
        if (oldValue && newValue && oldValue !== newValue) {
          const duplicate = await prisma.profileConflict.findFirst({
            where: {
              profileId,
              field: `experience.${existing.id}.${field}`,
              status: "pending",
            },
          });
          if (!duplicate) {
            await prisma.profileConflict.create({
              data: {
                profileId,
                field: `experience.${existing.id}.${field}`,
                message: `${item.title} at ${item.company} has conflicting ${field === "startDate" ? "start" : "end"} dates.`,
                optionsJson: JSON.stringify([oldValue, newValue]),
              },
            });
          }
        }
      }
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
          profileId,
          company: item.company,
          title: item.title,
          startDate: item.startDate,
          endDate: item.endDate,
          location: item.location,
          bulletsJson: JSON.stringify(item.bullets),
          sourceDocumentIds: JSON.stringify([documentId]),
        },
      });
    }
  }

  for (const name of parsed.skills) {
    if (!name.trim()) continue;
    await prisma.skill.upsert({
      where: { profileId_name: { profileId, name: name.trim() } },
      create: {
        profileId,
        name: name.trim(),
        sourceDocumentIds: JSON.stringify([documentId]),
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
      where: { profileId_title: { profileId, title: candidate.title } },
      create: {
        profileId,
        title: candidate.title,
        reason: candidate.reason,
        pinned: false,
        source: "suggested",
      },
      update: {},
    });
  }
}
