import { describe, expect, it } from "vitest";
import { isPublicAPIPath } from "./middleware.js";
import { clientIp, rateLimit } from "./rateLimit.js";
import { hashToken } from "./tokens.js";
import { detectResumeMedia } from "../intake/magic.js";
import { encryptSecret, decryptSecret } from "../crypto.js";

describe("auth helpers", () => {
  it("allows only documented public API paths", () => {
    expect(isPublicAPIPath("/api/auth/challenge")).toBe(true);
    expect(isPublicAPIPath("/api/auth/refresh")).toBe(true);
    expect(isPublicAPIPath("/api/health/ready")).toBe(true);
    expect(isPublicAPIPath("/api/mail/google/callback")).toBe(true);
    expect(isPublicAPIPath("/api/mail/google/pubsub")).toBe(true);
    expect(isPublicAPIPath("/api/profile")).toBe(false);
    expect(isPublicAPIPath("/api/jobs")).toBe(false);
    expect(isPublicAPIPath("/api/mail/events")).toBe(false);
    expect(isPublicAPIPath("/api/search/sessions")).toBe(false);
  });

  it("hashes tokens stably and rate-limits a key", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abcd"));
    const key = `test-${Date.now()}`;
    expect(rateLimit(key, 2, 60_000)).toBe(true);
    expect(rateLimit(key, 2, 60_000)).toBe(true);
    expect(rateLimit(key, 2, 60_000)).toBe(false);
    expect(clientIp({ get: (name) => (name === "fly-client-ip" ? "1.2.3.4" : undefined) })).toBe("1.2.3.4");
  });

  it("round-trips encrypted secrets", () => {
    const secret = "refresh-token-value";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });
});

describe("resume magic", () => {
  it("accepts PDF, DOCX and text resumes and rejects empty binaries", () => {
    expect(detectResumeMedia("cv.pdf", Buffer.from("%PDF-1.7 sample"))?.kind).toBe("pdf");
    expect(detectResumeMedia("cv.docx", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]))?.kind).toBe("docx");
    expect(detectResumeMedia("cv.txt", Buffer.from("Experience\nSkills\nEducation"))?.kind).toBe("txt");
    expect(detectResumeMedia("cv.bin", Buffer.from([0, 1, 2, 3]))).toBeNull();
  });
});
