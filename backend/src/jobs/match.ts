import type { ExperienceItem, Profile, Skill, TitleInterest } from "@prisma/client";
import type { JobRequirements, ProviderJob } from "./types.js";

type MatchProfile = Profile & {
  skills: Skill[];
  experienceItems: ExperienceItem[];
  titleInterests: TitleInterest[];
};

const SKILLS = [
  "sql",
  "python",
  "javascript",
  "typescript",
  "swift",
  "react",
  "aws",
  "azure",
  "figma",
  "jira",
  "salesforce",
  "tableau",
  "excel",
  "analytics",
  "product strategy",
  "roadmap",
  "stakeholder management",
  "project management",
  "customer discovery",
  "machine learning",
  "api",
  "healthcare",
  "fintech",
];

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9+#.]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  return [...a].filter((token) => b.has(token)).length / Math.min(a.size, b.size);
}

export function deepRead(description: string, title = ""): JobRequirements {
  const text = `${title}\n${description}`;
  const yearRanges = [
    ...text.matchAll(
      /\b(?:minimum of |at least )?(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\+?\s+years?(?:\s+of)?/gi,
    ),
  ];
  const years = yearRanges.map((match) => Number(match[1])).filter(Number.isFinite);
  const maxes = yearRanges.map((match) => Number(match[2] || match[1])).filter(Number.isFinite);
  const lower = text.toLowerCase();
  const seniority =
    ["principal", "staff", "director", "lead", "senior", "associate", "junior", "intern"].find(
      (level) => lower.includes(level),
    ) ?? "mid";
  const requiredSkills = SKILLS.filter((skill) => lower.includes(skill));
  const impliedRequirements: string[] = [];
  if (/\bmentor|manage a team|people manager|direct reports\b/i.test(text))
    impliedRequirements.push("People leadership");
  if (/\bfast[- ]paced|wear many hats|self[- ]starter\b/i.test(text))
    impliedRequirements.push("High autonomy / limited support");
  if (/\bon[- ]call|after hours|weekends\b/i.test(text))
    impliedRequirements.push("On-call or after-hours availability");
  if (/\bremote\b.*\b(?:within|based in|reside|metro|commutable)\b/i.test(text))
    impliedRequirements.push("Remote role has a location restriction");
  if (/\bclearance|u\.?s\.? persons?|citizen(?:ship)? required\b/i.test(text))
    impliedRequirements.push("Citizenship or clearance constraint");
  const workAuthorization =
    text.match(/\b(?:must be authorized|sponsorship|u\.?s\.? persons?|citizenship required)[^.]{0,100}/i)?.[0] ??
    null;
  const travel = text.match(/\b(?:travel|on[- ]site visits?)[^.]{0,60}/i)?.[0] ?? null;
  const degree = text.match(/\b(?:bachelor'?s|master'?s|phd|degree required)[^.]{0,80}/i)?.[0] ?? null;
  return {
    minYears: years.length ? Math.max(...years) : null,
    maxYears: maxes.length ? Math.max(...maxes) : null,
    seniority,
    requiredSkills,
    impliedRequirements,
    workAuthorization,
    travel,
    onCall: /\bon[- ]call|after hours|weekends\b/i.test(text),
    degree,
  };
}

export function scoreJob(profile: MatchProfile, job: ProviderJob, requirements: JobRequirements) {
  const titleTargets = [
    ...profile.titleInterests.filter((interest) => interest.pinned).map((interest) => interest.title),
    ...profile.experienceItems.map((item) => item.title),
  ];
  const titleScore = Math.max(
    0,
    ...titleTargets.map((title) => overlap(tokens(title), tokens(job.title))),
  );
  const profileSkills = new Set(profile.skills.map((skill) => skill.name.toLowerCase()));
  const skillHits = requirements.requiredSkills.filter((skill) => profileSkills.has(skill));
  const skillScore = requirements.requiredSkills.length
    ? skillHits.length / requirements.requiredSkills.length
    : 0.55;
  const locationText = `${job.location || ""} ${profile.location || ""}`.toLowerCase();
  const locationScore =
    job.remote || !profile.location || locationText.includes(profile.location.toLowerCase()) ? 1 : 0.45;
  const yearsCap = profile.maxYearsRequired;
  const yearsMiss =
    requirements.minYears !== null && yearsCap !== null && requirements.minYears > yearsCap;
  const hardMisses: string[] = [];
  if (yearsMiss) hardMisses.push(`Requires ${requirements.minYears}+ years`);
  if (requirements.workAuthorization) hardMisses.push(requirements.workAuthorization);

  const raw = titleScore * 45 + skillScore * 35 + locationScore * 15 + (hardMisses.length ? 0 : 5);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const difficulty =
    score >= 75 && !hardMisses.length ? "easy" : score >= 50 && hardMisses.length < 2 ? "medium" : "reach";
  const explanation = [
    `${Math.round(titleScore * 100)}% title affinity`,
    requirements.requiredSkills.length
      ? `${skillHits.length}/${requirements.requiredSkills.length} listed skills`
      : "transferable-skill role",
    hardMisses.length ? hardMisses[0] : "no detected hard gate",
  ].join("; ");
  return {
    score,
    difficulty,
    explanation,
    breakdown: {
      title: Math.round(titleScore * 100),
      skills: Math.round(skillScore * 100),
      location: Math.round(locationScore * 100),
    },
    hiddenMisses: hardMisses,
  };
}
