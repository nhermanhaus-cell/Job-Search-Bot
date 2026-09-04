import { prisma } from "../db.js";
import { defaultProviderNames } from "./providers.js";
import { createSearchSession } from "./search.js";

export async function runStandingSearches() {
  const profiles = await prisma.profile.findMany({
    where: { onboardingDone: true },
    include: { titleInterests: { where: { pinned: true } } },
  });
  const sessions = [];
  for (const profile of profiles) {
    for (const interest of profile.titleInterests) {
      sessions.push(
        await createSearchSession(
          profile.id,
          { query: interest.title, location: profile.location },
          defaultProviderNames,
        ),
      );
    }
  }
  return sessions;
}
