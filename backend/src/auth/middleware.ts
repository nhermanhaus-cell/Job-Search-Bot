import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { AuthContext } from "./types.js";
import { verifyAccessToken } from "./tokens.js";

export type APIEnv = {
  Variables: {
    auth: AuthContext;
  };
};

async function authenticate(c: Context<APIEnv>) {
  const header = c.req.header("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  try {
    c.set("auth", await verifyAccessToken(token));
    return true;
  } catch {
    return false;
  }
}

export const requireAuth = createMiddleware<APIEnv>(async (c, next) => {
  if (!(await authenticate(c))) return c.json({ error: "invalid_or_expired_session" }, 401);
  await next();
});

export function isPublicAPIPath(path: string) {
  return (
    path.startsWith("/api/auth/") ||
    path.startsWith("/api/health") ||
    path === "/api/mail/google/callback" ||
    path === "/api/mail/google/pubsub" ||
    path === "/api/auth/apple/notifications"
  );
}

export const protectAPI = createMiddleware<APIEnv>(async (c, next) => {
  if (isPublicAPIPath(c.req.path)) {
    await next();
    return;
  }
  if (!(await authenticate(c))) return c.json({ error: "authentication_required" }, 401);
  await next();
});
