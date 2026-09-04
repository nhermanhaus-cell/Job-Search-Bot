import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("unauthenticated IDOR surface", () => {
  it("rejects personal routes without a bearer token", async () => {
    const paths = [
      "/api/profile",
      "/api/applications",
      "/api/jobs",
      "/api/search/sessions",
      "/api/mail/events",
      "/api/stats/jobs",
      "/api/settings",
      "/api/sync",
    ];
    for (const path of paths) {
      const response = await app.request(path);
      expect(response.status, path).toBe(401);
    }
  });

  it("keeps health and legal pages public", async () => {
    expect((await app.request("/api/health/live")).status).toBe(200);
    expect((await app.request("/privacy")).status).toBe(200);
    expect((await app.request("/terms")).status).toBe(200);
  });
});
