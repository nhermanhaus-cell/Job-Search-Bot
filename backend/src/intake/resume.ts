import mammoth from "mammoth";
import OpenAI from "openai";
import { extractText } from "unpdf";
import { env } from "../env.js";

export type ParsedExperience = {
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  bullets: string[];
};

export type ParsedResume = {
  name: string | null;
  email: string | null;
  location: string | null;
  summary: string | null;
  experiences: ParsedExperience[];
  skills: string[];
  education: string[];
  titleSuggestions: { title: string; reason: string }[];
};

export async function extractResumeText(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const result = await extractText(new Uint8Array(bytes), { mergePages: true });
    return result.text;
  }
  if (
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return (await mammoth.extractRawText({ buffer: bytes })).value;
  }
  return bytes.toString("utf8");
}

export async function parseResume(text: string): Promise<ParsedResume> {
  const fallback = deterministicParse(text);
  if (!env.openaiApiKey || text.trim().length < 80) return fallback;
  try {
    return await modelParse(text, fallback);
  } catch {
    return fallback;
  }
}

function deterministicParse(text: string): ParsedResume {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const email = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] ?? null;
  const skillsHeading = lines.findIndex((line) => /^skills(?:\s*&\s*tools)?$/i.test(line));
  const skills =
    skillsHeading >= 0
      ? lines
          .slice(skillsHeading + 1, skillsHeading + 5)
          .join(",")
          .split(/[,|•·]/)
          .map((skill) => skill.trim())
          .filter((skill) => skill.length > 1 && skill.length < 40)
      : [];

  const experiences: ParsedExperience[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(
      /^(.{2,60}?)\s+(?:at|@|\|)\s+(.{2,60}?)(?:\s+[|–—-]\s+(.+))?$/,
    );
    if (!match) continue;
    const bullets: string[] = [];
    for (const line of lines.slice(i + 1, i + 8)) {
      if (/^[•·*-]\s*/.test(line)) bullets.push(line.replace(/^[•·*-]\s*/, ""));
    }
    experiences.push({
      title: match[1].trim(),
      company: match[2].trim(),
      startDate: null,
      endDate: null,
      location: null,
      bullets,
    });
  }

  const titleSuggestions = [...new Set(experiences.map((item) => item.title))].map((title) => ({
    title,
    reason: "A title found in your uploaded resume",
  }));
  return {
    name: lines[0] && lines[0].length < 80 ? lines[0] : null,
    email,
    location: null,
    summary: null,
    experiences,
    skills: [...new Set(skills)],
    education: [],
    titleSuggestions,
  };
}

async function modelParse(text: string, fallback: ParsedResume): Promise<ParsedResume> {
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const completion = await client.chat.completions.create({
    model: env.openaiModel,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "resume_intake",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: ["string", "null"] },
            email: { type: ["string", "null"] },
            location: { type: ["string", "null"] },
            summary: { type: ["string", "null"] },
            experiences: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  company: { type: "string" },
                  title: { type: "string" },
                  startDate: { type: ["string", "null"] },
                  endDate: { type: ["string", "null"] },
                  location: { type: ["string", "null"] },
                  bullets: { type: "array", items: { type: "string" } },
                },
                required: ["company", "title", "startDate", "endDate", "location", "bullets"],
              },
            },
            skills: { type: "array", items: { type: "string" } },
            education: { type: "array", items: { type: "string" } },
            titleSuggestions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["title", "reason"],
              },
            },
          },
          required: [
            "name",
            "email",
            "location",
            "summary",
            "experiences",
            "skills",
            "education",
            "titleSuggestions",
          ],
        },
      },
    },
    messages: [
      {
        role: "system",
        content:
          "Extract only facts present in this resume. Repair two-column reading order. Keep metrics exactly. Suggest adjacent job titles only when supported by titles, skills, or duties, and explain why.",
      },
      { role: "user", content: text.slice(0, 30_000) },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) return fallback;
  return JSON.parse(raw) as ParsedResume;
}

export function adjacentTitles(title: string): string[] {
  const value = title.toLowerCase();
  const map: [RegExp, string[]][] = [
    [/product manager/, ["Technical Product Manager", "Product Operations Manager", "Program Manager"]],
    [/software|developer|engineer/, ["Solutions Engineer", "Developer Advocate", "Technical Program Manager"]],
    [/writer|content|documentation/, ["Technical Writer", "Content Designer", "Documentation Engineer"]],
    [/customer success|account manager/, ["Implementation Manager", "Solutions Consultant", "Customer Experience Manager"]],
    [/operations|analyst/, ["Business Operations Analyst", "Program Manager", "Implementation Specialist"]],
    [/designer|ux|user experience/, ["Product Designer", "UX Researcher", "Content Designer"]],
  ];
  return map.find(([pattern]) => pattern.test(value))?.[1] ?? [];
}
