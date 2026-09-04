import "./env.js";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function ensureProfile() {
  return prisma.profile.upsert({
    where: { id: "local" },
    create: { id: "local", name: "You" },
    update: {},
  });
}
