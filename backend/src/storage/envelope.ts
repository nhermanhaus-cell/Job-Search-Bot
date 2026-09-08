import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../env.js";

export type Envelope = {
  ciphertext: Buffer;
  wrappedKey: string;
  wrappedKeyIv: string;
  wrappedKeyTag: string;
  objectIv: string;
  objectTag: string;
  keyVersion: number;
};

const KEY_VERSION = 1;

function masterKey(version = KEY_VERSION): Buffer {
  const material = env.objectEncryptionKey || env.tokenKey;
  return createHash("sha256").update(`job-hunt-os:object:v${version}:${material}`).digest();
}

export function wrapKey(dek: Buffer, version = KEY_VERSION) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(version), iv);
  const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
  return {
    wrappedKey: wrapped.toString("base64"),
    wrappedKeyIv: iv.toString("base64"),
    wrappedKeyTag: cipher.getAuthTag().toString("base64"),
    keyVersion: version,
  };
}

export function unwrapKey(envelope: Pick<Envelope, "wrappedKey" | "wrappedKeyIv" | "wrappedKeyTag" | "keyVersion">): Buffer {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    masterKey(envelope.keyVersion),
    Buffer.from(envelope.wrappedKeyIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.wrappedKeyTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(envelope.wrappedKey, "base64")), decipher.final()]);
}

export function encryptBytes(plain: Buffer): Envelope {
  const dek = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext,
    objectIv: iv.toString("base64"),
    objectTag: tag.toString("base64"),
    ...wrapKey(dek),
  };
}

export function decryptBytes(ciphertext: Buffer, envelope: Omit<Envelope, "ciphertext">): Buffer {
  const dek = unwrapKey(envelope);
  const decipher = createDecipheriv("aes-256-gcm", dek, Buffer.from(envelope.objectIv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.objectTag, "base64"));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
