import { describe, expect, it } from "vitest";
import { findMatchingApplication } from "./ingest.js";

describe("findMatchingApplication", () => {
  const apps = [
    { id: "a1", company: "Acme", jobTitle: "Product Manager" },
    { id: "a2", company: "Lumen", jobTitle: "Solutions Engineer" },
  ];

  it("matches company and title", () => {
    expect(findMatchingApplication(apps, "Acme", "Product Manager")).toBe("a1");
  });

  it("matches company alone", () => {
    expect(findMatchingApplication(apps, "lumen", null)).toBe("a2");
  });

  it("returns null when unknown", () => {
    expect(findMatchingApplication(apps, "Globex", "PM")).toBeNull();
  });
});
