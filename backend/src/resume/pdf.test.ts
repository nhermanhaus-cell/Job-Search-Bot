import { describe, expect, it } from "vitest";
import { extractText } from "unpdf";
import { renderResumePdf } from "./pdf.js";

describe("resume PDF", () => {
  it("embeds ATS-readable name, skills and experience", async () => {
    const pdf = await renderResumePdf({
      name: "Alex Candidate",
      email: "alex@example.com",
      summary: "Product manager who ships analytics.",
      skills: ["SQL", "Roadmaps"],
      experience: [
        {
          company: "Acme",
          title: "Product Manager",
          dates: "2020 – 2024",
          bullets: ["Launched a reporting suite used by 20 customers"],
        },
      ],
      target: { title: "Product Manager", company: "Northwind" },
    });
    const extracted = await extractText(new Uint8Array(pdf), { mergePages: true });
    expect(extracted.text).toContain("Alex Candidate");
    expect(extracted.text).toContain("SQL");
    expect(extracted.text).toContain("Product Manager");
    expect(extracted.text).toContain("Acme");
  });
});
