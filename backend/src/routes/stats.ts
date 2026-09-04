import { Hono } from "hono";
import { ensureProfile, prisma } from "../db.js";

export const statsRoutes = new Hono();

statsRoutes.get("/jobs", async (c) => {
  const profile = await ensureProfile();
  const from = c.req.query("from");
  const since = from ? new Date(from) : new Date(Date.now() - 30 * 86_400_000);
  const matches = await prisma.match.findMany({
    where: { profileId: profile.id, createdAt: { gte: since }, hidden: false },
    include: { job: true },
    orderBy: { createdAt: "asc" },
  });
  const days = new Map<
    string,
    { date: string; total: number; easy: number; medium: number; reach: number }
  >();
  const bySource: Record<string, number> = {};
  for (const match of matches) {
    const date = match.createdAt.toISOString().slice(0, 10);
    const row = days.get(date) ?? { date, total: 0, easy: 0, medium: 0, reach: 0 };
    row.total += 1;
    const difficulty = (match.userDifficulty ?? match.difficulty) as "easy" | "medium" | "reach";
    row[difficulty] += 1;
    days.set(date, row);
    bySource[match.job.provider] = (bySource[match.job.provider] ?? 0) + 1;
  }
  const difficulty = { easy: 0, medium: 0, reach: 0 };
  for (const row of days.values()) {
    difficulty.easy += row.easy;
    difficulty.medium += row.medium;
    difficulty.reach += row.reach;
  }
  return c.json({
    total: matches.length,
    difficulty,
    bySource,
    series: [...days.values()],
  });
});
