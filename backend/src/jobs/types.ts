export type SearchQuery = {
  query: string;
  location?: string | null;
  remote?: boolean;
};

export type ProviderJob = {
  provider: string;
  providerJobId: string;
  title: string;
  company: string;
  location?: string | null;
  remote?: boolean;
  description: string;
  listingUrl: string;
  salaryText?: string | null;
  postedAt?: Date | null;
};

export type SearchEvent =
  | { type: "source_started"; source: string }
  | { type: "source_done"; source: string; count: number }
  | { type: "source_error"; source: string; error: string }
  | { type: "source_skipped"; source: string; reason: string }
  | { type: "job"; source: string; job: unknown; match: unknown }
  | { type: "session_done"; sessionId: string };

export type JobRequirements = {
  minYears: number | null;
  maxYears: number | null;
  seniority: string;
  requiredSkills: string[];
  impliedRequirements: string[];
  workAuthorization: string | null;
  travel: string | null;
  onCall: boolean;
  degree: string | null;
};
