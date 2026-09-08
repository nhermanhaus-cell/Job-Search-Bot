import { describe, expect, it } from "vitest";
import { parseResume } from "./resume.js";

describe("resume intake", () => {
  it("extracts identity, skills, and title suggestions without an API key", async () => {
    const parsed = await parseResume(`
Alex Candidate
alex@example.com

Product Manager at Acme
• Launched analytics tools for 20 customers
• Partnered with engineering and design

SKILLS
SQL, Jira, Analytics, Stakeholder Management
`);
    expect(parsed.name).toBe("Alex Candidate");
    expect(parsed.email).toBe("alex@example.com");
    expect(parsed.experiences[0]?.title).toBe("Product Manager");
    expect(parsed.skills).toContain("SQL");
    expect(parsed.titleSuggestions.map((item) => item.title)).toContain("Product Manager");
  });
});
