import { describe, expect, it } from "vitest";
import { mergeBoardLists, parseBoardList, parseBoardSlug } from "./atsBoards.js";

describe("ATS board slugs", () => {
  it("extracts slugs from Greenhouse, Lever and Ashby URLs", () => {
    expect(parseBoardSlug("https://boards.greenhouse.io/stripe")).toBe("stripe");
    expect(parseBoardSlug("https://job-boards.greenhouse.io/databricks/jobs/123")).toBe("databricks");
    expect(parseBoardSlug("https://boards.greenhouse.io/embed/job_board?for=airbnb")).toBe("airbnb");
    expect(parseBoardSlug("https://jobs.lever.co/palantir/abcd")).toBe("palantir");
    expect(parseBoardSlug("https://jobs.ashbyhq.com/openai")).toBe("openai");
    expect(parseBoardSlug("stripe")).toBe("stripe");
  });

  it("dedupes comma and URL mixes", () => {
    expect(
      parseBoardList("stripe, https://jobs.ashbyhq.com/openai openai, STRIPE"),
    ).toEqual(["stripe", "openai"]);
    expect(mergeBoardLists("stripe", "airbnb,stripe")).toEqual(["stripe", "airbnb"]);
  });
});
