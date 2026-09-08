import { describe, expect, it } from "vitest";
import { classifyWithRules } from "./classifier.js";

describe("classifyWithRules", () => {
  it("pulls the company from applying-to subjects on ATS mailers", () => {
    const result = classifyWithRules({
      messageId: "0",
      fromAddress: "noreply@greenhouse.io",
      subject: "Thank you for applying to Acme — Product Manager",
      snippet: "Thank you for your application. We received your application for Product Manager at Acme.",
    });
    expect(result.type).toBe("receipt");
    expect(result.company).toBe("Acme");
    expect(result.jobTitle).toBe("Product Manager");
  });

  it("labels application receipts", () => {
    const result = classifyWithRules({
      messageId: "1",
      fromAddress: "noreply@greenhouse.io",
      subject: "Thank you for applying to Acme — Product Manager",
      snippet: "Thank you for your application. We received your application for Product Manager.",
    });
    expect(result.type).toBe("receipt");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("labels rejections", () => {
    const result = classifyWithRules({
      messageId: "2",
      fromAddress: "talent@northwind.com",
      subject: "Your application",
      snippet: "Unfortunately we will not be moving forward with your application at this time.",
    });
    expect(result.type).toBe("rejection");
    expect(result.company).toBe("Northwind");
  });

  it("labels interview invites", () => {
    const result = classifyWithRules({
      messageId: "3",
      fromAddress: "jordan@lumen.io",
      subject: "Interview availability",
      snippet: "We would like to schedule an interview. https://cal.example/jordan",
    });
    expect(result.type).toBe("interview_invite");
    expect(result.meetingUrl).toContain("https://");
  });

  it("ignores job-alert newsletters", () => {
    const result = classifyWithRules({
      messageId: "4",
      fromAddress: "alerts@indeed.com",
      subject: "12 jobs for you",
      snippet: "Recommended jobs you may like. Unsubscribe anytime.",
    });
    expect(result.type).toBe("newsletter_ignore");
  });
});
