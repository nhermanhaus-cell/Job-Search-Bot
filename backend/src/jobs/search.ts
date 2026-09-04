import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { prisma } from "../db.js";
import { deepReadJob, scoreJob } from "./match.js";
import { defaultProviderNames, providers } from "./providers.js";
import type { ProviderJob, SearchEvent, SearchQuery } from "./types.js";

type SessionFeed = {
  events: SearchEvent[];
  emitter: EventEmitter;
  done: boolean;
};

const feeds = new Map<string, SessionFeed>();

function emit(sessionId: string, event: SearchEvent) {
  const feed = feeds.get(sessionId);
  if (!feed) return;
  feed.events.push(event);
  feed.emitter.emit("event", event);
  if (event.type === "session_done") feed.done = true;
}

function fingerprint(job: ProviderJob): string {
  return createHash("sha256")
    .update(`${job.company.toLowerCase()}|${job.title.toLowerCase()}|${(job.location || "").toLowerCase()}`)
    .digest("hex");
}

export async function createSearchSession(
  profileId: string,
  query: SearchQuery,
  sourceNames = defaultProviderNames,
) {
  const session = await prisma.searchSession.create({
    data: {
      profileId,
      query: query.query,
      location: query.location,
      sourceNames: JSON.stringify(sourceNames),
      sourceRuns: {
        create: sourceNames.map((source) => ({ source })),
      },
    },
  });
  feeds.set(session.id, { events: [], emitter: new EventEmitter(), done: false });
  setTimeout(() => {
    runSearch(session.id, profileId, query, sourceNames).catch((error) => {
      console.error("search session failed", error);
      emit(session.id, { type: "session_done", sessionId: session.id });
    });
  }, 0);
  return session;
}

async function runSearch(
  sessionId: string,
  profileId: string,
  query: SearchQuery,
  sourceNames: string[],
) {
  await prisma.searchSession.update({ where: { id: sessionId }, data: { status: "running" } });
  await Promise.all(
    sourceNames.map(async (sourceName) => {
      const provider = providers.get(sourceName);
      if (!provider) {
        emit(sessionId, { type: "source_error", source: sourceName, error: "Unknown provider" });
        return;
      }
      if (!provider.configured()) {
        await prisma.searchSourceRun.update({
          where: { sessionId_source: { sessionId, source: sourceName } },
          data: { status: "needs_key", error: provider.missingReason, completedAt: new Date() },
        });
        emit(sessionId, {
          type: "source_skipped",
          source: sourceName,
          reason: provider.missingReason || "Not configured",
        });
        return;
      }
      emit(sessionId, { type: "source_started", source: sourceName });
      await prisma.searchSourceRun.update({
        where: { sessionId_source: { sessionId, source: sourceName } },
        data: { status: "running", startedAt: new Date() },
      });
      try {
        const jobs = await provider.search(query);
        let count = 0;
        for (const candidate of jobs) {
          const { job, match } = await storeAndMatch(profileId, candidate);
          count += 1;
          emit(sessionId, { type: "job", source: sourceName, job, match });
        }
        await prisma.searchSourceRun.update({
          where: { sessionId_source: { sessionId, source: sourceName } },
          data: { status: "done", resultCount: count, completedAt: new Date() },
        });
        emit(sessionId, { type: "source_done", source: sourceName, count });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await prisma.searchSourceRun.update({
          where: { sessionId_source: { sessionId, source: sourceName } },
          data: { status: "error", error: message, completedAt: new Date() },
        });
        emit(sessionId, { type: "source_error", source: sourceName, error: message });
      }
    }),
  );
  await prisma.searchSession.update({
    where: { id: sessionId },
    data: { status: "done", completedAt: new Date() },
  });
  emit(sessionId, { type: "session_done", sessionId });
}

export async function storeAndMatch(profileId: string, candidate: ProviderJob) {
  const requirements = await deepReadJob(candidate.description, candidate.title);
  const source = {
    provider: candidate.provider,
    providerJobId: candidate.providerJobId,
    listingUrl: candidate.listingUrl,
  };
  const fp = fingerprint(candidate);
  const existing = await prisma.job.findUnique({ where: { fingerprint: fp } });
  const sources = existing
    ? [
        ...new Map(
          [
            ...(JSON.parse(existing.sourcesJson) as typeof source[]),
            source,
          ].map((item) => [`${item.provider}:${item.providerJobId}`, item]),
        ).values(),
      ]
    : [source];
  const job = await prisma.job.upsert({
    where: { fingerprint: fp },
    create: {
      fingerprint: fp,
      ...candidate,
      location: candidate.location,
      remote: candidate.remote ?? false,
      salaryText: candidate.salaryText,
      postedAt: candidate.postedAt,
      requirementsJson: JSON.stringify(requirements),
      sourcesJson: JSON.stringify(sources),
    },
    update: {
      description:
        candidate.description.length > (existing?.description.length ?? 0)
          ? candidate.description
          : undefined,
      sourcesJson: JSON.stringify(sources),
      requirementsJson: JSON.stringify(requirements),
    },
  });
  const profile = await prisma.profile.findUniqueOrThrow({
    where: { id: profileId },
    include: { skills: true, experienceItems: true, titleInterests: true },
  });
  const scored = scoreJob(profile, candidate, requirements);
  const match = await prisma.match.upsert({
    where: { profileId_jobId: { profileId, jobId: job.id } },
    create: {
      profileId,
      jobId: job.id,
      score: scored.score,
      difficulty: scored.difficulty,
      explanation: scored.explanation,
      breakdownJson: JSON.stringify(scored.breakdown),
      hiddenMisses: JSON.stringify(scored.hiddenMisses),
    },
    update: {
      score: scored.score,
      difficulty: scored.difficulty,
      explanation: scored.explanation,
      breakdownJson: JSON.stringify(scored.breakdown),
      hiddenMisses: JSON.stringify(scored.hiddenMisses),
    },
  });
  return {
    job: {
      ...job,
      requirements,
      sources,
    },
    match: {
      ...match,
      breakdown: scored.breakdown,
      hiddenMisses: scored.hiddenMisses,
    },
  };
}

export function feedFor(sessionId: string) {
  return feeds.get(sessionId);
}
