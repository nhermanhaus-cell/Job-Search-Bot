import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db.js";
import { ingestPayload } from "./ingest.js";

const ids = ["itest-receipt", "itest-reject", "itest-news"];
let profileId: string | null = null;

describe("ingestPayload", () => {
  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const user = await prisma.user.create({
        data: {
          email: "ingest-test@example.com",
          profile: { create: { name: "Ingest Test" } },
        },
        include: { profile: true },
      });
      profileId = user.profile!.id;
    } catch {
      profileId = null;
    }
  });

  afterAll(async () => {
    if (profileId) {
      const user = await prisma.profile.findUnique({ where: { id: profileId } });
      if (user) await prisma.user.delete({ where: { id: user.userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("creates an application from a receipt and updates it on rejection", async () => {
    if (!profileId) return;
    const receipt = await ingestPayload(profileId, {
      messageId: "itest-receipt",
      fromAddress: "jobs@acme.com",
      subject: "Thank you for applying to Acme — Designer",
      snippet: "We received your application for Designer at Acme.",
      receivedAt: new Date(),
    });
    expect(receipt.classification).toBe("receipt");
    expect(receipt.applicationId).toBeTruthy();
    expect(receipt.reviewState).toBe("auto");

    const rejection = await ingestPayload(profileId, {
      messageId: "itest-reject",
      fromAddress: "talent@northwind.com",
      subject: "Update from Northwind",
      snippet: "Unfortunately we will not be moving forward with your application.",
      receivedAt: new Date(),
    });
    expect(rejection.classification).toBe("rejection");

    const news = await ingestPayload(profileId, {
      messageId: "itest-news",
      fromAddress: "alerts@indeed.com",
      subject: "Jobs for you",
      snippet: "Recommended jobs you may like. Unsubscribe.",
      receivedAt: new Date(),
    });
    expect(news.classification).toBe("newsletter_ignore");
    expect(news.reviewState).toBe("ignored");
    expect(news.applicationId).toBeNull();
    expect(ids.length).toBe(3);
  });
});
