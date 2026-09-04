import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../db.js";
import { ingestPayload } from "./ingest.js";

const ids = ["itest-receipt", "itest-reject", "itest-news"];

describe("ingestPayload", () => {
  afterAll(async () => {
    await prisma.mailEvent.deleteMany({ where: { messageId: { in: ids } } });
    await prisma.application.deleteMany({ where: { company: { in: ["Acme", "Northwind"] }, source: "gmail_inferred" } });
    await prisma.$disconnect();
  });

  it("creates an application from a receipt and updates it on rejection", async () => {
    await prisma.profile.upsert({ where: { id: "local" }, create: { id: "local" }, update: {} });

    const receipt = await ingestPayload("local", {
      messageId: "itest-receipt",
      fromAddress: "jobs@acme.com",
      subject: "Thank you for applying to Acme — Designer",
      snippet: "We received your application for Designer at Acme.",
      receivedAt: new Date(),
    });
    expect(receipt.classification).toBe("receipt");
    expect(receipt.applicationId).toBeTruthy();
    expect(receipt.reviewState).toBe("auto");

    const rejection = await ingestPayload("local", {
      messageId: "itest-reject",
      fromAddress: "talent@northwind.com",
      subject: "Update from Northwind",
      snippet: "Unfortunately we will not be moving forward with your application.",
      receivedAt: new Date(),
    });
    expect(rejection.classification).toBe("rejection");

    const news = await ingestPayload("local", {
      messageId: "itest-news",
      fromAddress: "alerts@indeed.com",
      subject: "Jobs for you",
      snippet: "Recommended jobs you may like. Unsubscribe.",
      receivedAt: new Date(),
    });
    expect(news.classification).toBe("newsletter_ignore");
    expect(news.reviewState).toBe("ignored");
    expect(news.applicationId).toBeNull();
  });
});
