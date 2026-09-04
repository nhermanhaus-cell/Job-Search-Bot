import { prisma } from "../src/db.js";
import { putEncryptedObject } from "../src/storage/index.js";

const leftover = await prisma.resumeDocument.findMany({
  where: { rawText: { not: null }, objectId: null },
});

for (const document of leftover) {
  if (!document.rawText) continue;
  const stored = await putEncryptedObject({
    profileId: document.profileId,
    kind: "resume",
    originalName: document.fileName,
    contentType: document.mediaType,
    bytes: Buffer.from(document.rawText, "utf8"),
  });
  await prisma.resumeDocument.update({
    where: { id: document.id },
    data: { objectId: stored.id, rawText: null, parseStatus: document.parseStatus || "ready" },
  });
  console.log("backfilled", document.id);
}

await prisma.$disconnect();
