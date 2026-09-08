import OpenAI from "openai";
import { env } from "../env.js";
import {
  MAIL_TYPES,
  type ClassifiedMail,
  type MailPayload,
  type MailType,
} from "./types.js";

const REJECTION =
  /\b(unfortunately|regret to inform|not moving forward|other candidates|will not be moving|decided not to|position has been filled)\b/i;
const RECEIPT =
  /\b(thank you for (your )?appl(y|ication)|application (was )?received|we received your application|successfully submitted)\b/i;
const INTERVIEW =
  /\b(interview|schedule a (call|chat|conversation)|book a time|availability|speak with (our|the) team|phone screen|recruiter screen)\b/i;
const RESCHEDULE = /\b(reschedule|new time|need to move)\b/i;
const OFFER = /\b(offer of employment|pleased to offer|job offer|compensation package)\b/i;
const NEWSLETTER =
  /\b(jobs? (for you|you may like)|recommended (jobs|roles)|unsubscribe|job alert)\b/i;
const REQUEST_INFO = /\b(portfolio|work authorization|right to work|please (send|provide)|additional information)\b/i;

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function guessCompany(payload: MailPayload): string | null {
  const blob = [payload.subject, payload.snippet, payload.bodyText].filter(Boolean).join("\n");
  const named = blob.match(
    /\b(?:applying to|application (?:to|at|for)|at|join(?:ing)?)\s+([A-Z][\w.&'-]+(?:\s+[A-Z][\w.&'-]+){0,3})/,
  );
  if (named) {
    const name = named[1].replace(/\s+[—–-].*$/, "").trim();
    if (name && !/^(Product|Software|Senior|Staff|Your|This|Our)\b/i.test(name)) return name;
  }
  const from = payload.fromAddress ?? "";
  const angle = from.match(/@([a-z0-9.-]+)/i)?.[1];
  if (angle) {
    const host = angle.replace(/^(mail|jobs|careers|apply|notifications|no-?reply)\./i, "");
    const knownAts = /greenhouse|lever|ashby|workday|smartrecruiters|icims|workable|successfactors|indeed|linkedin/i;
    if (!knownAts.test(host)) {
      const base = host.split(".")[0];
      if (base && base.length > 2) return titleCase(base.replace(/[-_]/g, " "));
    }
  }
  return null;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function guessJobTitle(payload: MailPayload): string | null {
  const subject = payload.subject ?? "";
  const dashed = subject.split(/\s*[—–|-]\s*/).map((s) => s.trim());
  if (dashed.length > 1) {
    const last = dashed[dashed.length - 1];
    if (last && last.length < 80 && !/thank you|update|received|application$/i.test(last)) {
      return last;
    }
  }
  const blob = [payload.subject, payload.snippet].filter(Boolean).join(" ");
  const forRole = blob.match(/\bfor (?:the )?([A-Z][A-Za-z0-9 /+&#-]{2,60}?)(?:\s+at\s+|\.|$)/);
  if (forRole) return forRole[1].trim();
  return null;
}

export function classifyWithRules(payload: MailPayload): ClassifiedMail {
  const text = [payload.subject, payload.snippet, payload.bodyText].filter(Boolean).join("\n");
  const company = guessCompany(payload);
  const jobTitle = guessJobTitle(payload);

  if (NEWSLETTER.test(text) && !INTERVIEW.test(text) && !REJECTION.test(text) && !RECEIPT.test(text)) {
    return {
      type: "newsletter_ignore",
      company,
      jobTitle: null,
      confidence: 0.82,
      eventTime: null,
      meetingUrl: null,
      nextAction: null,
    };
  }
  if (OFFER.test(text)) {
    return { type: "offer", company, jobTitle, confidence: 0.86, eventTime: null, meetingUrl: null, nextAction: "Review offer" };
  }
  if (RESCHEDULE.test(text) && INTERVIEW.test(text)) {
    return {
      type: "interview_reschedule",
      company,
      jobTitle,
      confidence: 0.8,
      eventTime: null,
      meetingUrl: extractUrl(text),
      nextAction: "Confirm new time",
    };
  }
  if (INTERVIEW.test(text)) {
    const screen = /\b(phone screen|recruiter screen|introductory call|quick chat)\b/i.test(text);
    return {
      type: screen ? "recruiter_screen" : "interview_invite",
      company,
      jobTitle,
      confidence: 0.8,
      eventTime: null,
      meetingUrl: extractUrl(text),
      nextAction: "Respond with availability",
    };
  }
  if (REJECTION.test(text)) {
    return { type: "rejection", company, jobTitle, confidence: 0.88, eventTime: null, meetingUrl: null, nextAction: null };
  }
  if (REQUEST_INFO.test(text)) {
    return { type: "request_info", company, jobTitle, confidence: 0.72, eventTime: null, meetingUrl: null, nextAction: "Reply with requested info" };
  }
  if (RECEIPT.test(text)) {
    return { type: "receipt", company, jobTitle, confidence: 0.84, eventTime: null, meetingUrl: null, nextAction: null };
  }
  return {
    type: "newsletter_ignore",
    company,
    jobTitle: null,
    confidence: 0.35,
    eventTime: null,
    meetingUrl: null,
    nextAction: null,
  };
}

function extractUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s>]+/)?.[0] ?? null;
}

export async function classifyMail(payload: MailPayload): Promise<ClassifiedMail> {
  const rules = classifyWithRules(payload);
  if (rules.confidence >= 0.75 || !env.openaiApiKey) {
    return rules;
  }
  try {
    return await classifyWithOpenAI(payload, rules);
  } catch {
    return rules;
  }
}

async function classifyWithOpenAI(payload: MailPayload, fallback: ClassifiedMail): Promise<ClassifiedMail> {
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const completion = await client.chat.completions.create({
    model: env.openaiModel,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "mail_classification",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: [...MAIL_TYPES] },
            company: { type: ["string", "null"] },
            jobTitle: { type: ["string", "null"] },
            confidence: { type: "number" },
            eventTime: { type: ["string", "null"] },
            meetingUrl: { type: ["string", "null"] },
            nextAction: { type: ["string", "null"] },
          },
          required: ["type", "company", "jobTitle", "confidence", "eventTime", "meetingUrl", "nextAction"],
        },
      },
    },
    messages: [
      {
        role: "system",
        content:
          "Classify a recruiting email for a job-hunt tracker. Use newsletter_ignore for alerts, marketing, and non-application mail. Never invent companies or interview times; use null if unknown. confidence is 0-1.",
      },
      {
        role: "user",
        content: JSON.stringify({
          from: payload.fromAddress,
          subject: payload.subject,
          snippet: payload.snippet,
          body: (payload.bodyText ?? "").slice(0, 4000),
          ruleGuess: fallback,
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return fallback;
  const parsed = JSON.parse(raw) as ClassifiedMail;
  if (!MAIL_TYPES.includes(parsed.type as MailType)) return fallback;
  return {
    type: parsed.type,
    company: parsed.company || fallback.company,
    jobTitle: parsed.jobTitle || fallback.jobTitle,
    confidence: clamp(Number(parsed.confidence) || fallback.confidence),
    eventTime: parsed.eventTime,
    meetingUrl: parsed.meetingUrl,
    nextAction: parsed.nextAction,
  };
}
