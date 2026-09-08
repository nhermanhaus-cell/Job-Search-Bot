export const MAIL_TYPES = [
  "receipt",
  "rejection",
  "request_info",
  "recruiter_screen",
  "interview_invite",
  "interview_reschedule",
  "offer",
  "newsletter_ignore",
] as const;

export type MailType = (typeof MAIL_TYPES)[number];

export type ClassifiedMail = {
  type: MailType;
  company: string | null;
  jobTitle: string | null;
  confidence: number;
  eventTime: string | null;
  meetingUrl: string | null;
  nextAction: string | null;
};

export type MailPayload = {
  messageId: string;
  threadId?: string | null;
  fromAddress?: string | null;
  subject?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
  receivedAt?: Date | null;
};

export const STATUS_BY_TYPE: Record<MailType, string | null> = {
  receipt: "submitted",
  rejection: "rejected",
  request_info: "opened",
  recruiter_screen: "interview",
  interview_invite: "interview",
  interview_reschedule: "interview",
  offer: "offer",
  newsletter_ignore: null,
};

export const ATS_QUERY =
  'newer_than:120d (from:greenhouse-mail.io OR from:greenhouse.io OR from:lever.co OR from:hire.lever.co OR from:ashbyhq.com OR from:myworkday.com OR from:myworkdayjobs.com OR from:smartrecruiters.com OR from:successfactors.com OR from:icims.com OR from:workablemail.com OR subject:interview OR subject:"thank you for applying" OR subject:unfortunately OR subject:"application received" OR subject:"next steps" OR subject:offer OR "we regret" OR "not moving forward")';
