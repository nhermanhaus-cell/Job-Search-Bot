import "./env.js";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function profileFor(c: { get(name: "auth"): { userId: string; profileId: string } }) {
  const auth = c.get("auth");
  return prisma.profile.findFirstOrThrow({
    where: { id: auth.profileId, userId: auth.userId },
  });
}
