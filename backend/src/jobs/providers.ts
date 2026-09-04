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

const jsearch: Provider = {
  name: "jsearch",
  configured: () => Boolean(env.jsearchApiKey),
  missingReason: "Set JSEARCH_API_KEY or RAPIDAPI_KEY",
  search: async ({ query, location, remote }) => {
    const url = new URL("https://jsearch.p.rapidapi.com/search");
    url.searchParams.set("query", `${query}${location ? ` in ${location}` : ""}`);
    url.searchParams.set("page", "1");
    url.searchParams.set("num_pages", "1");
    if (remote) url.searchParams.set("remote_jobs_only", "true");
    const response = await fetch(url, {
      headers: {
        "x-rapidapi-key": env.jsearchApiKey,
        "x-rapidapi-host": "jsearch.p.rapidapi.com",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as {
      data?: {
        job_id: string;
        job_title: string;
        employer_name: string;
        job_city?: string;
        job_state?: string;
        job_is_remote?: boolean;
        job_description?: string;
        job_apply_link: string;
        job_min_salary?: number;
        job_max_salary?: number;
        job_posted_at_datetime_utc?: string;
      }[];
    };
    return (data.data ?? []).map((job) => ({
      provider: "jsearch",
      providerJobId: job.job_id,
      title: job.job_title,
      company: job.employer_name,
      location: [job.job_city, job.job_state].filter(Boolean).join(", ") || (job.job_is_remote ? "Remote" : null),
      remote: job.job_is_remote,
      description: job.job_description || "",
      listingUrl: job.job_apply_link,
      salaryText:
        job.job_min_salary || job.job_max_salary
          ? `$${job.job_min_salary || "?"}–$${job.job_max_salary || "?"}`
          : null,
      postedAt: job.job_posted_at_datetime_utc ? new Date(job.job_posted_at_datetime_utc) : null,
    }));
  },
};

const jooble: Provider = {
  name: "jooble",
  configured: () => Boolean(env.joobleApiKey),
  missingReason: "Set JOOBLE_API_KEY",
  search: async ({ query, location }) => {
    const response = await fetch(`https://jooble.org/api/${env.joobleApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: query, location: location || "" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as {
      jobs?: {
        id?: number | string;
        title: string;
        company: string;
        location?: string;
        snippet?: string;
        link: string;
        salary?: string;
        updated?: string;
      }[];
    };
    return (data.jobs ?? []).slice(0, 30).map((job) => ({
      provider: "jooble",
      providerJobId: String(job.id || job.link),
      title: stripHtml(job.title),
      company: stripHtml(job.company),
      location: job.location,
      description: stripHtml(job.snippet || ""),
      listingUrl: job.link,
      salaryText: job.salary || null,
      postedAt: job.updated ? new Date(job.updated) : null,
    }));
  },
};

function slugs(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

const greenhouse: Provider = {
  name: "greenhouse",
  configured: () => slugs(env.greenhouseBoards).length > 0,
  missingReason: "Set GREENHOUSE_BOARDS to comma-separated company board slugs",
  search: async ({ query }) => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const batches = await Promise.all(
      slugs(env.greenhouseBoards).map(async (board) => {
        const response = await fetch(
          `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`,
          { signal: AbortSignal.timeout(15_000) },
        );
        if (!response.ok) return [];
        const data = (await response.json()) as {
          jobs?: {
            id: number;
            title: string;
            company_name?: string;
            location?: { name?: string };
            content?: string;
            absolute_url: string;
            updated_at?: string;
          }[];
        };
        return (data.jobs ?? [])
          .filter((job) => terms.some((term) => `${job.title} ${job.content}`.toLowerCase().includes(term)))
          .map((job) => ({
            provider: "greenhouse",
            providerJobId: `${board}:${job.id}`,
            title: job.title,
            company: job.company_name || board,
            location: job.location?.name,
            description: stripHtml(job.content || ""),
            listingUrl: job.absolute_url,
            postedAt: job.updated_at ? new Date(job.updated_at) : null,
          }));
      }),
    );
    return batches.flat().slice(0, 60);
  },
};

const lever: Provider = {
  name: "lever",
  configured: () => slugs(env.leverSites).length > 0,
  missingReason: "Set LEVER_SITES to comma-separated company site slugs",
  search: async ({ query }) => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const batches = await Promise.all(
      slugs(env.leverSites).map(async (site) => {
        const response = await fetch(
          `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`,
          { signal: AbortSignal.timeout(15_000) },
        );
        if (!response.ok) return [];
        const data = (await response.json()) as {
          id: string;
          text: string;
          descriptionPlain?: string;
          additionalPlain?: string;
          hostedUrl: string;
          categories?: { location?: string };
          createdAt?: number;
        }[];
        return data
          .filter((job) => terms.some((term) => `${job.text} ${job.descriptionPlain}`.toLowerCase().includes(term)))
          .map((job) => ({
            provider: "lever",
            providerJobId: `${site}:${job.id}`,
            title: job.text,
            company: site,
            location: job.categories?.location,
            description: `${job.descriptionPlain || ""}\n${job.additionalPlain || ""}`,
            listingUrl: job.hostedUrl,
            postedAt: job.createdAt ? new Date(job.createdAt) : null,
          }));
      }),
    );
    return batches.flat().slice(0, 60);
  },
};

const ashby: Provider = {
  name: "ashby",
  configured: () => slugs(env.ashbyBoards).length > 0,
  missingReason: "Set ASHBY_BOARDS to comma-separated company board slugs",
  search: async ({ query }) => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const batches = await Promise.all(
      slugs(env.ashbyBoards).map(async (board) => {
        const response = await fetch(
          `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`,
          { signal: AbortSignal.timeout(15_000) },
        );
        if (!response.ok) return [];
        const data = (await response.json()) as {
          jobs?: {
            id: string;
            title: string;
            location?: string;
            isRemote?: boolean;
            isListed?: boolean;
            descriptionPlain?: string;
            descriptionHtml?: string;
            jobUrl: string;
            publishedAt?: string;
            compensation?: { compensationTierSummary?: string };
          }[];
        };
        return (data.jobs ?? [])
          .filter((job) => job.isListed !== false)
          .filter((job) => terms.some((term) => `${job.title} ${job.descriptionPlain}`.toLowerCase().includes(term)))
          .map((job) => ({
            provider: "ashby",
            providerJobId: `${board}:${job.id}`,
            title: job.title,
            company: board,
            location: job.location,
            remote: job.isRemote,
            description: job.descriptionPlain || stripHtml(job.descriptionHtml || ""),
            listingUrl: job.jobUrl,
            salaryText: job.compensation?.compensationTierSummary || null,
            postedAt: job.publishedAt ? new Date(job.publishedAt) : null,
          }));
      }),
    );
    return batches.flat().slice(0, 60);
  },
};

export const providers = new Map(
  [demo, remotive, remoteok, adzuna, usajobs, jsearch, jooble, greenhouse, lever, ashby].map(
    (provider) => [provider.name, provider],
  ),
);

export const defaultProviderNames = [
  "demo",
  "remotive",
  "remoteok",
  "jsearch",
  "adzuna",
  "jooble",
  "usajobs",
  "greenhouse",
  "lever",
  "ashby",
];
