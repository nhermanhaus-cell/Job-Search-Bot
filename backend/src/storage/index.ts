import {
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { decryptBytes, encryptBytes, sha256 } from "./envelope.js";

const localRoot = join(env.dataDir, "objects");

function s3(): S3Client | null {
  if (!env.objectAccessKey || !env.objectSecretKey) return null;
  return new S3Client({
    region: env.objectRegion,
    endpoint: env.objectEndpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.objectAccessKey,
      secretAccessKey: env.objectSecretKey,
    },
  });
}

export function objectKey(profileId: string, kind: string, id: string, fileName: string) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return `profiles/${profileId}/${kind}/${id}/${safe}`;
}

async function putRaw(key: string, body: Buffer, contentType: string) {
  const client = s3();
  if (!client) {
    const path = join(localRoot, key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, body, { mode: 0o600 });
    return;
  }
  await client.send(
    new PutObjectCommand({
      Bucket: env.objectBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    }),
  );
}

async function getRaw(key: string): Promise<Buffer> {
  const client = s3();
  if (!client) return readFile(join(localRoot, key));
  const result = await client.send(new GetObjectCommand({ Bucket: env.objectBucket, Key: key }));
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) throw new Error("empty_object");
  return Buffer.from(bytes);
}

async function deleteRaw(key: string) {
  const client = s3();
  if (!client) {
    await rm(join(localRoot, key), { force: true });
    return;
  }
  await client.send(new DeleteObjectCommand({ Bucket: env.objectBucket, Key: key }));
}

export async function pingStorage(): Promise<boolean> {
  try {
    const client = s3();
    if (!client) {
      await mkdir(localRoot, { recursive: true, mode: 0o700 });
      return true;
    }
    await client.send(new HeadBucketCommand({ Bucket: env.objectBucket }));
    return true;
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : "unknown" }, "object store ping failed");
    return false;
  }
}

export async function ensureBucket() {
  const client = s3();
  if (!client) {
    await mkdir(localRoot, { recursive: true, mode: 0o700 });
    return;
  }
  try {
    await client.send(new HeadBucketCommand({ Bucket: env.objectBucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: env.objectBucket }));
  }
}

export async function putEncryptedObject(input: {
  profileId: string;
  kind: string;
  originalName: string;
  contentType: string;
  bytes: Buffer;
}) {
  const id = crypto.randomUUID();
  const key = objectKey(input.profileId, input.kind, id, input.originalName);
  const envelope = encryptBytes(input.bytes);
  await putRaw(key, envelope.ciphertext, "application/octet-stream");
  return prisma.storedObject.create({
    data: {
      profileId: input.profileId,
      bucket: env.objectBucket,
      objectKey: key,
      kind: input.kind,
      originalName: input.originalName,
      contentType: input.contentType,
      byteSize: input.bytes.length,
      checksumSha256: sha256(input.bytes),
      wrappedKey: envelope.wrappedKey,
      wrappedKeyIv: envelope.wrappedKeyIv,
      wrappedKeyTag: envelope.wrappedKeyTag,
      objectIv: envelope.objectIv,
      objectTag: envelope.objectTag,
      keyVersion: envelope.keyVersion,
      status: "ready",
    },
  });
}

export async function getDecryptedObject(id: string, profileId: string): Promise<{ bytes: Buffer; contentType: string; originalName: string | null }> {
  const stored = await prisma.storedObject.findFirst({
    where: { id, profileId, deletedAt: null },
  });
  if (!stored || !stored.wrappedKey) throw new Error("object_not_found");
  const ciphertext = await getRaw(stored.objectKey);
  const bytes = decryptBytes(ciphertext, {
    wrappedKey: stored.wrappedKey,
    wrappedKeyIv: stored.wrappedKeyIv,
    wrappedKeyTag: stored.wrappedKeyTag,
    objectIv: stored.objectIv,
    objectTag: stored.objectTag,
    keyVersion: stored.keyVersion,
  });
  if (sha256(bytes) !== stored.checksumSha256) throw new Error("checksum_mismatch");
  return { bytes, contentType: stored.contentType, originalName: stored.originalName };
}

export async function cryptoShred(profileId: string) {
  await prisma.storedObject.updateMany({
    where: { profileId, deletedAt: null },
    data: {
      wrappedKey: "",
      wrappedKeyIv: "",
      wrappedKeyTag: "",
      objectIv: "",
      objectTag: "",
      status: "shredded",
      deletedAt: new Date(),
    },
  });
}

export async function deletePrefix(profileId: string) {
  const prefix = `profiles/${profileId}/`;
  const client = s3();
  if (!client) {
    await rm(join(localRoot, prefix), { recursive: true, force: true });
    return;
  }
  let token: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: env.objectBucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    const keys = (listed.Contents ?? []).map((object) => object.Key).filter((key): key is string => Boolean(key));
    if (keys.length) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: env.objectBucket,
          Delete: { Objects: keys.map((Key) => ({ Key })) },
        }),
      );
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
}
