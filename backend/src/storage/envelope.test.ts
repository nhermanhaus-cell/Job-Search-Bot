import { describe, expect, it } from "vitest";
import { decryptBytes, encryptBytes, unwrapKey } from "./envelope.js";

describe("envelope encryption", () => {
  it("round-trips plaintext and fails on tampered ciphertext", () => {
    const plain = Buffer.from("resume bytes for Alex Candidate");
    const envelope = encryptBytes(plain);
    expect(decryptBytes(envelope.ciphertext, envelope).toString()).toBe(plain.toString());
    envelope.ciphertext[0] ^= 0xff;
    expect(() => decryptBytes(envelope.ciphertext, envelope)).toThrow();
  });

  it("cannot unwrap a key after crypto-shred", () => {
    const envelope = encryptBytes(Buffer.from("secret"));
    expect(unwrapKey(envelope).length).toBe(32);
    expect(() =>
      unwrapKey({
        ...envelope,
        wrappedKey: "",
        wrappedKeyIv: "",
        wrappedKeyTag: "",
      }),
    ).toThrow();
  });
});
