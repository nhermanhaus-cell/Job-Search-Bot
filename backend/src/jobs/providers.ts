import { env } from "../env.js";
import type { ProviderJob, SearchQuery } from "./types.js";

export type Provider = {
  name: string;
  configured: () => boolean;
  missingReason?: string;
  search: (query: SearchQuery) => Promise<ProviderJob[]>;
};

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const demo: Provider = {
  name: "demo",
  configured: () => true,
  search: async ({ query, location }) => {
    const title = query || "Product Manager";
    return [
      {
        provider: "demo",
        providerJobId: `${title}-acme`,
        title,
        company: "Acme Labs",
        location: location || "Remote — US",
        remote: true,
        description: `We are hiring a ${title}. You will own cross-functional launches, analyze customer feedback, and partner with engineering. Requirements: 3+ years of relevant experience, strong communication, analytics, and stakeholder management. Remote in the United States.`,
        listingUrl: "https://example.com/jobs/acme",
        salaryText: "$105,000–$135,000",
        postedAt: new Date(),
      },
      {
        provider: "demo",
        providerJobId: `${title}-northwind`,
        title: `Senior ${title}`,
        company: "Northwind Health",
        location: "New York, NY (Hybrid)",
        remote: false,
        description: `Lead strategy for a regulated healthcare portfolio. Must have at least 7 years experience and mentor two associate team members. Travel up to 20%. Bachelor's degree required.`,
        listingUrl: "https://example.com/jobs/northwind",
        postedAt: new Date(),
      },
      {
        provider: "demo",
        providerJobId: `${title}-lumen`,
        title: `Associate ${title}`,
        company: "Lumen Studio",
        location: "Remote",
        remote: true,
        description: `Support customer discovery, roadmap operations, and launch communications. One to two years of experience preferred. Familiarity with SQL, Jira, and product analytics is a plus.`,
        listingUrl: "https://example.com/jobs/lumen",
        postedAt: new Date(),
      },
    ];
  },
};

const remotive: Provider = {
  name: "remotive",
  configured: () => true,
  search: async ({ query }) => {
    const url = new URL("https://remotive.com/api/remote-jobs");
    url.searchParams.set("search", query);
    url.searchParams.set("limit", "30");
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as {
      jobs?: {
        id: number;
        title: string;
        company_name: string;
        candidate_required_location?: string;
        description: string;
        url: string;
        salary?: string;
        publication_date?: string;
      }[];
    };
    return (data.jobs ?? []).map((job) => ({
      provider: "remotive",
      providerJobId: String(job.id),
      title: job.title,
      company: job.company_name,
      location: job.candidate_required_location ?? "Remote",
      remote: true,
      description: stripHtml(job.description),
      listingUrl: job.url,
      salaryText: job.salary || null,
      postedAt: job.publication_date ? new Date(job.publication_date) : null,
    }));
  },
};

const remoteok: Provider = {
  name: "remoteok",
  configured: () => true,
  search: async ({ query }) => {
    const response = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "JobHuntOS/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const data = (await response.json()) as Record<string, unknown>[];
    return data
      .filter((job) => job.id && job.position && job.company)
      .filter((job) => {
        const haystack = `${job.position} ${job.description} ${(job.tags as string[])?.join(" ")}`.toLowerCase();
        return terms.some((term) => haystack.includes(term));
      })
      .slice(0, 30)
      .map((job) => ({
        provider: "remoteok",
        providerJobId: String(job.id),
        title: String(job.position),
        company: String(job.company),
        location: String(job.location || "Remote"),
        remote: true,
        description: stripHtml(String(job.description || "")),
        listingUrl: String(job.url || `https://remoteok.com/remote-jobs/${job.id}`),
        salaryText:
          job.salary_min || job.salary_max
            ? `$${job.salary_min || "?"}–$${job.salary_max || "?"}`
            : null,
        postedAt: job.date ? new Date(String(job.date)) : null,
      }));
  },
};

const adzuna: Provider = {
  name: "adzuna",
  configured: () => Boolean(env.adzunaAppId && env.adzunaAppKey),
  missingReason: "Set ADZUNA_APP_ID and ADZUNA_APP_KEY",
  search: async ({ query, location }) => {
    const url = new URL("https://api.adzuna.com/v1/api/jobs/us/search/1");
    url.searchParams.set("app_id", env.adzunaAppId);
    url.searchParams.set("app_key", env.adzunaAppKey);
    url.searchParams.set("what", query);
    url.searchParams.set("where", location || "");
    url.searchParams.set("results_per_page", "30");
    url.searchParams.set("max_days_old", "14");
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as {
      results?: {
        id: string;
        title: string;
        company?: { display_name?: string };
        location?: { display_name?: string };
        description?: string;
        redirect_url: string;
        salary_min?: number;
        salary_max?: number;
        created?: string;
      }[];
    };
    return (data.results ?? []).map((job) => ({
      provider: "adzuna",
      providerJobId: job.id,
      title: job.title,
      company: job.company?.display_name || "Unknown company",
      location: job.location?.display_name,
      description: job.description || "",
      listingUrl: job.redirect_url,
      salaryText:
        job.salary_min || job.salary_max
          ? `$${Math.round(job.salary_min || 0).toLocaleString()}–$${Math.round(job.salary_max || 0).toLocaleString()}`
          : null,
      postedAt: job.created ? new Date(job.created) : null,
    }));
  },
};

const usajobs: Provider = {
  name: "usajobs",
  configured: () => Boolean(env.usajobsApiKey && env.usajobsEmail),
  missingReason: "Set USAJOBS_API_KEY and USAJOBS_EMAIL",
  search: async ({ query, location }) => {
    const url = new URL("https://data.usajobs.gov/api/search");
    url.searchParams.set("Keyword", query);
    if (location) url.searchParams.set("LocationName", location);
    url.searchParams.set("ResultsPerPage", "30");
    const response = await fetch(url, {
      headers: {
        "Authorization-Key": env.usajobsApiKey,
        "User-Agent": env.usajobsEmail,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as {
      SearchResult?: {
        SearchResultItems?: {
          MatchedObjectId: string;
          MatchedObjectDescriptor: {
            PositionTitle: string;
            OrganizationName: string;
            PositionLocationDisplay?: string;
            UserArea?: { Details?: { JobSummary?: string; Requirements?: string } };
            PositionURI: string;
            PositionStartDate?: string;
            PositionRemuneration?: { MinimumRange?: string; MaximumRange?: string }[];
          };
        }[];
      };
    };
    return (data.SearchResult?.SearchResultItems ?? []).map((item) => {
      const job = item.MatchedObjectDescriptor;
      const pay = job.PositionRemuneration?.[0];
      return {
        provider: "usajobs",
        providerJobId: item.MatchedObjectId,
        title: job.PositionTitle,
        company: job.OrganizationName,
        location: job.PositionLocationDisplay,
        description: `${job.UserArea?.Details?.JobSummary || ""}\n${job.UserArea?.Details?.Requirements || ""}`,
        listingUrl: job.PositionURI,
        salaryText: pay ? `$${pay.MinimumRange || "?"}–$${pay.MaximumRange || "?"}` : null,
        postedAt: job.PositionStartDate ? new Date(job.PositionStartDate) : null,
      };
    });
  },
};

export const providers = new Map(
  [demo, remotive, remoteok, adzuna, usajobs].map((provider) => [provider.name, provider]),
);

export const defaultProviderNames = ["demo", "remotive", "remoteok", "adzuna", "usajobs"];
