import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import { createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { env } from "../env.js";

const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const googleClient = new OAuth2Client();

export type VerifiedIdentity = {
  provider: "apple" | "google";
  subject: string;
  email: string | null;
  emailVerified: boolean;
  providerRefreshToken?: string;
};

export async function verifyAppleIdentity(input: {
  identityToken: string;
  authorizationCode?: string;
  expectedNonceHash: string;
}): Promise<VerifiedIdentity> {
  const { payload } = await jwtVerify(input.identityToken, appleKeys, {
    issuer: "https://appleid.apple.com",
    audience: env.appleClientIds,
  });
  if (!payload.sub || payload.nonce !== input.expectedNonceHash) {
    throw new Error("invalid_apple_identity");
  }
  let providerRefreshToken: string | undefined;
  if (input.authorizationCode && appleServerConfigured()) {
    const tokens = await exchangeAppleCode(input.authorizationCode);
    providerRefreshToken = tokens.refresh_token;
  } else if (env.nodeEnv === "production") {
    throw new Error("apple_authorization_code_required");
  }
  return {
    provider: "apple",
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    providerRefreshToken,
  };
}

export async function verifyGoogleIdentity(identityToken: string, expectedNonceHash?: string): Promise<VerifiedIdentity> {
  if (!env.googleServerClientIds.length) throw new Error("google_auth_not_configured");
  const ticket = await googleClient.verifyIdToken({
    idToken: identityToken,
    audience: env.googleServerClientIds,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new Error("invalid_google_identity");
  if (expectedNonceHash && payload.nonce) {
    const matches =
      payload.nonce === expectedNonceHash ||
      createHash("sha256").update(payload.nonce).digest("hex") === expectedNonceHash;
    if (!matches) throw new Error("invalid_google_nonce");
  } else if (env.nodeEnv === "production" && expectedNonceHash && !payload.nonce) {
    throw new Error("missing_google_nonce");
  }
  return {
    provider: "google",
    subject: payload.sub,
    email: payload.email ?? null,
    emailVerified: payload.email_verified === true,
  };
}

export async function revokeAppleRefreshToken(refreshToken: string) {
  if (!appleServerConfigured()) throw new Error("apple_auth_not_configured");
  const response = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.appleClientIds[0],
      client_secret: await appleClientSecret(),
      token: refreshToken,
      token_type_hint: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`apple_revoke_failed_${response.status}`);
}

function appleServerConfigured() {
  return Boolean(
    env.appleTeamId &&
      env.appleKeyId &&
      env.applePrivateKey &&
      env.appleClientIds.length,
  );
}

async function appleClientSecret() {
  const key = await importPKCS8(env.applePrivateKey, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.appleKeyId })
    .setIssuer(env.appleTeamId)
    .setSubject(env.appleClientIds[0])
    .setAudience("https://appleid.apple.com")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

async function exchangeAppleCode(code: string) {
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.appleClientIds[0],
      client_secret: await appleClientSecret(),
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`apple_token_exchange_failed_${response.status}`);
  return (await response.json()) as { refresh_token?: string };
}
