import { google } from "googleapis";
import { env, gmailScopes, googleRedirectUri } from "../env.js";
import { decryptSecret, encryptSecret } from "../crypto.js";
import type { MailAccount } from "@prisma/client";
import type { MailPayload } from "./types.js";
import { ATS_QUERY } from "./types.js";

export function googleConfigured(): boolean {
  return Boolean(env.googleClientId && env.googleClientSecret);
}

export function oauthClient() {
  if (!googleConfigured()) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are not set");
  }
  return new google.auth.OAuth2(env.googleClientId, env.googleClientSecret, googleRedirectUri);
}

export function authUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: gmailScopes,
    state,
  });
}

export async function exchangeCode(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token. Disconnect the app in Google Account permissions and try again.");
  }
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const me = await oauth2.userinfo.get();
  return {
    email: me.data.email ?? "unknown",
    refreshTokenEnc: encryptSecret(tokens.refresh_token),
    accessTokenEnc: tokens.access_token ? encryptSecret(tokens.access_token) : null,
    accessTokenExp: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}

export function gmailFor(account: MailAccount) {
  const client = oauthClient();
  client.setCredentials({
    refresh_token: decryptSecret(account.refreshTokenEnc),
    access_token: account.accessTokenEnc ? decryptSecret(account.accessTokenEnc) : undefined,
  });
  return google.gmail({ version: "v1", auth: client });
}

function header(headers: { name?: string | null; value?: string | null }[] | undefined, name: string): string | null {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function decodeBody(data?: string | null): string {
  if (!data) return "";
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function collectText(payload?: {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: unknown;
}): string {
  if (!payload) return "";
  const mime = payload.mimeType ?? "";
  if (mime.startsWith("text/plain")) return decodeBody(payload.body?.data);
  const parts = (payload.parts ?? []) as typeof payload[];
  return parts.map((p) => collectText(p)).filter(Boolean).join("\n");
}

export async function listCandidateMessages(account: MailAccount, pageToken?: string) {
  const gmail = gmailFor(account);
  const res = await gmail.users.messages.list({
    userId: "me",
    q: ATS_QUERY,
    maxResults: 50,
    pageToken,
  });
  return {
    ids: (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id)),
    nextPageToken: res.data.nextPageToken ?? null,
  };
}

export async function fetchMessage(account: MailAccount, id: string): Promise<MailPayload> {
  const gmail = gmailFor(account);
  const res = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  const payload = res.data.payload;
  const headers = payload?.headers ?? [];
  const internal = res.data.internalDate ? new Date(Number(res.data.internalDate)) : null;
  return {
    messageId: res.data.id ?? id,
    threadId: res.data.threadId,
    fromAddress: header(headers, "From"),
    subject: header(headers, "Subject"),
    snippet: res.data.snippet ?? null,
    bodyText: collectText(payload).slice(0, 8000),
    receivedAt: internal,
  };
}
