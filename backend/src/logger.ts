import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.nodeEnv === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "headers.authorization",
      "accessToken",
      "refreshToken",
      "identityToken",
      "authorizationCode",
      "rawText",
      "email",
      "user.email",
      "*.email",
      "*.refreshTokenEnc",
      "*.accessTokenEnc",
      "*.wrappedKey",
      "snippet",
      "rawExcerpt",
      "bodyText",
    ],
    censor: "[redacted]",
  },
});

export function requestId(): string {
  return crypto.randomUUID();
}
