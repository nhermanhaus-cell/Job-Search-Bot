import { describe, expect, it } from "vitest";
import { deepRead, scoreJob } from "./match.js";

describe("deepRead", () => {
  it("finds hidden experience, leadership, travel, and degree gates", () => {
    const result = deepRead(
      "Must have at least 7 years experience and mentor two associates. Travel up to 20%. Bachelor's degree required.",
      "Senior Product Manager",
    );
    expect(result.minYears).toBe(7);
    expect(result.seniority).toBe("senior");
    expect(result.impliedRequirements).toContain("People leadership");
    expect(result.travel).toContain("Travel");
    expect(result.degree).toContain("Bachelor");
  });
});

describe("scoreJob", () => {
  it("bands an aligned role as easy", () => {
    const requirements = deepRead(
      "Three years preferred. Product strategy, roadmap, analytics and stakeholder management.",
      "Product Manager",
    );
    const scored = scoreJob(
      {
        id: "local",
        name: null,
        email: null,
        location: "Remote",
        remotePreference: null,
        maxYearsRequired: 6,
        summary: null,
        enabledSourcesJson: "[\"demo\"]",
        mailPollMinutes: 15,
        onboardingDone: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        skills: ["analytics", "roadmap", "product strategy", "stakeholder management"].map(
          (name, index) => ({
            id: String(index),
            profileId: "local",
            name,
            aliasesJson: "[]",
            confidence: 1,
            sourceDocumentIds: "[]",
          }),
        ),
        experienceItems: [],
        titleInterests: [
          {
            id: "t",
            profileId: "local",
            title: "Product Manager",
            reason: null,
            pinned: true,
            source: "user",
            createdAt: new Date(),
          },
        ],
      },
      {
        provider: "test",
        providerJobId: "1",
        title: "Product Manager",
        company: "Acme",
        location: "Remote",
        remote: true,
        description: "",
        listingUrl: "https://example.com",
      },
      requirements,
    );
    expect(scored.difficulty).toBe("easy");
    expect(scored.score).toBeGreaterThanOrEqual(75);
  });
});
