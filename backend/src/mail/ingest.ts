import type { Application, MailEvent } from "@prisma/client";
import { prisma } from "../db.js";
import { classifyMail } from "./classifier.js";
import type { ClassifiedMail, MailPayload } from "./types.js";
import { STATUS_BY_TYPE, type MailType } from "./types.js";

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function findMatchingApplication(
  apps: Pick<Application, "id" | "company" | "jobTitle">[],
  company: string | null,
  jobTitle: string | null,
): string | null {
  if (!company) return null;
  const c = norm(company);
  const titled = apps.filter((a) => norm(a.company) === c || norm(a.company).includes(c) || c.includes(norm(a.company)));
  if (titled.length === 0) return null;
  if (jobTitle) {
    const t = norm(jobTitle);
    const hit = titled.find((a) => a.jobTitle && (norm(a.jobTitle) === t || norm(a.jobTitle).includes(t) || t.includes(norm(a.jobTitle))));
    if (hit) return hit.id;
  }
  return titled[0]?.id ?? null;
}

function shouldAutoApply(classified: ClassifiedMail): boolean {
  return classified.type !== "newsletter_ignore" && classified.confidence >= 0.8 && Boolean(classified.company);
}

export async function ingestPayload(profileId: string, payload: MailPayload): Promise<MailEvent> {
  const existing = await prisma.mailEvent.findUnique({
    where: { provider_messageId: { provider: "gmail", messageId: payload.messageId } },
  });
  if (existing) return existing;

  const classified = await classifyMail(payload);
  const apps = await prisma.application.findMany({ where: { profileId } });
  let applicationId = findMatchingApplication(apps, classified.company, classified.jobTitle);
  const type = classified.type as MailType;
  const nextStatus = STATUS_BY_TYPE[type];
  const auto = shouldAutoApply(classified);

  if (!applicationId && auto && classified.company) {
    const created = await prisma.application.create({
      data: {
        profileId,
        company: classified.company,
        jobTitle: classified.jobTitle,
        status: nextStatus ?? "submitted",
        source: "gmail_inferred",
        appliedAt: payload.receivedAt ?? new Date(),
        submittedAt: type === "receipt" || type === "rejection" || type === "interview_invite" ? payload.receivedAt ?? new Date() : undefined,
        interviewAt: type.includes("interview") || type === "recruiter_screen" ? classified.eventTime ? new Date(classified.eventTime) : payload.receivedAt : undefined,
      },
    });
    applicationId = created.id;
  } else if (applicationId && auto && nextStatus) {
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: nextStatus,
        interviewAt:
          nextStatus === "interview"
            ? classified.eventTime
              ? new Date(classified.eventTime)
              : payload.receivedAt ?? undefined
            : undefined,
        closedAt: nextStatus === "rejected" || nextStatus === "offer" ? new Date() : undefined,
        jobTitle: classified.jobTitle ?? undefined,
      },
    });
  }

  return prisma.mailEvent.create({
    data: {
      profileId,
      applicationId,
      messageId: payload.messageId,
      threadId: payload.threadId,
      fromAddress: payload.fromAddress,
      subject: payload.subject,
      snippet: payload.snippet,
      receivedAt: payload.receivedAt,
      classification: classified.type,
      company: classified.company,
      jobTitle: classified.jobTitle,
      confidence: classified.confidence,
      eventTime: classified.eventTime ? new Date(classified.eventTime) : null,
      meetingUrl: classified.meetingUrl,
      nextAction: classified.nextAction,
      reviewState: auto ? "auto" : classified.type === "newsletter_ignore" ? "ignored" : "pending",
      rawExcerpt: (payload.bodyText ?? payload.snippet ?? "").slice(0, 1500),
    },
  });
}

export async function reviewMailEvent(
  id: string,
  action: "confirm" | "ignore",
  fields?: { company?: string; jobTitle?: string; classification?: string },
) {
  const event = await prisma.mailEvent.findUnique({ where: { id } });
  if (!event) throw new Error("Mail event not found");
  if (action === "ignore") {
    return prisma.mailEvent.update({
      where: { id },
      data: { reviewState: "ignored", ...fields },
    });
  }

  const classification = (fields?.classification ?? event.classification) as MailType;
  const company = fields?.company ?? event.company;
  const jobTitle = fields?.jobTitle ?? event.jobTitle;
  const nextStatus = STATUS_BY_TYPE[classification];
  let applicationId = event.applicationId;
  if (!applicationId && company && nextStatus) {
    const apps = await prisma.application.findMany({ where: { profileId: event.profileId } });
    applicationId = findMatchingApplication(apps, company, jobTitle);
    if (!applicationId) {
      const created = await prisma.application.create({
        data: {
          profileId: event.profileId,
          company,
          jobTitle,
          status: nextStatus,
          source: "gmail_inferred",
          appliedAt: event.receivedAt ?? new Date(),
        },
      });
      applicationId = created.id;
    }
  } else if (applicationId && nextStatus) {
    await prisma.application.update({ where: { id: applicationId }, data: { status: nextStatus } });
  }

  return prisma.mailEvent.update({
    where: { id },
    data: {
      reviewState: "confirmed",
      applicationId,
      company,
      jobTitle,
      classification,
    },
  });
}
