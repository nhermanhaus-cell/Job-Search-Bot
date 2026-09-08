/**
 * One-time helper before the first production migrate:
 *   BOOTSTRAP_ADMIN_SUB + BOOTSTRAP_ADMIN_PROVIDER attaches leftover local rows, otherwise they are purged.
 */
import { prisma } from "../src/db.js";

const provider = process.env.BOOTSTRAP_ADMIN_PROVIDER;
const subject = process.env.BOOTSTRAP_ADMIN_SUB;

const local = await prisma.profile.findUnique({ where: { id: "local" } }).catch(() => null);
if (!local) {
  console.log("No local profile to migrate.");
  process.exit(0);
}

if (provider && subject) {
  const identity = await prisma.authIdentity.findUnique({
    where: { provider_subject: { provider, subject } },
    include: { user: { include: { profile: true } } },
  });
  if (!identity?.user.profile) {
    throw new Error("Bootstrap admin identity not found; create the account first.");
  }
  console.log(`Attach leftover local rows to ${identity.user.profile.id} manually if any remain.`);
} else {
  console.log("BOOTSTRAP_ADMIN_* not set; refuse to guess. Purge sample data before production.");
}

await prisma.$disconnect();
