import { beforeAll, describe, expect, it } from "vitest";
import {
  DecryptionError,
  WrongRecoveryCodeError,
  decryptPhoto,
  encryptPhoto,
  formatRecoveryCode,
  fromBase64,
  generateAccountKeys,
  generateRecoveryCode,
  generateRunKey,
  importPrivateKey,
  importPublicKey,
  isCompleteRecoveryCode,
  keyIdFor,
  normalizeRecoveryCode,
  openPrivateKey,
  photoAad,
  rewrapRunKey,
  sealPrivateKey,
  toBase64,
  unwrapRunKey,
  wrapRunKey,
  type AccountKeys,
} from "./crypto";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xff, 0xd9]);
const AAD = photoAad("run-1", "photo-1");

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

let emma: AccountKeys;
let jonas: AccountKeys;
let stranger: AccountKeys;

beforeAll(async () => {
  [emma, jonas, stranger] = await Promise.all([generateAccountKeys(), generateAccountKeys(), generateAccountKeys()]);
});

describe("base64", () => {
  it("round-trips every byte value", () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});

describe("account keys", () => {
  it("exports a raw P-256 public key and a stable 16-hex key ID", async () => {
    expect(fromBase64(emma.publicKey)).toHaveLength(65);
    expect(emma.keyId).toMatch(/^[0-9a-f]{16}$/);
    expect(await keyIdFor(emma.publicKey)).toBe(emma.keyId);
    expect(emma.keyId).not.toBe(jonas.keyId);
  });

  it("keeps the everyday private key non-extractable", async () => {
    expect(emma.privateKey.extractable).toBe(false);
    const imported = await importPrivateKey(emma.privateKeyPkcs8);
    expect(imported.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("pkcs8", imported)).rejects.toThrow();
  });

  it("imports the public key", async () => {
    const key = await importPublicKey(emma.publicKey);
    expect(key.type).toBe("public");
  });

  it("imports a PKCS#8 key that opens run keys wrapped for the pair", async () => {
    const runKey = await generateRunKey();
    const wrapped = await wrapRunKey(runKey, emma.publicKey);
    const privateKey = await importPrivateKey(emma.privateKeyPkcs8);
    await expect(unwrapRunKey(wrapped.wrappedKey, wrapped.ephemeralPublicKey, privateKey)).resolves.toBeDefined();
  });
});

describe("recovery code", () => {
  it("is 24 Crockford base32 characters and differs between calls", () => {
    const codes = new Set(Array.from({ length: 20 }, generateRecoveryCode));
    expect(codes.size).toBe(20);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{24}$/);
      expect(isCompleteRecoveryCode(code)).toBe(true);
    }
  });

  it("formats in groups of four and normalises back", () => {
    const code = generateRecoveryCode();
    const shown = formatRecoveryCode(code);
    expect(shown).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/);
    expect(normalizeRecoveryCode(shown)).toBe(code);
  });

  it("tolerates case, spaces, dashes and look-alike letters", () => {
    expect(normalizeRecoveryCode(" ab1o-il 0z ")).toBe("AB10110Z");
    expect(isCompleteRecoveryCode("short")).toBe(false);
  });

  it("opens the sealed private key only with the right code", async () => {
    const code = "ABCD1234EFGH5678JKMN9PQR";
    const sealed = await sealPrivateKey(emma.privateKeyPkcs8, code);
    expect(fromBase64(sealed.salt)).toHaveLength(16);
    expect(fromBase64(sealed.iv)).toHaveLength(12);
    expect(sealed.blob).not.toContain(emma.privateKeyPkcs8.slice(0, 20));

    expect(await openPrivateKey(sealed, code)).toBe(emma.privateKeyPkcs8);
    const retyped = "abcd-i234-efgh-5678-jkmn-9pqr ";
    expect(await openPrivateKey(sealed, retyped)).toBe(emma.privateKeyPkcs8);

    const wrong = "ABCD1234EFGH5678JKMN9PQS";
    await expect(openPrivateKey(sealed, wrong)).rejects.toBeInstanceOf(WrongRecoveryCodeError);
  });

  it("uses a fresh salt and IV for each seal", async () => {
    const code = generateRecoveryCode();
    const [a, b] = await Promise.all([
      sealPrivateKey(emma.privateKeyPkcs8, code),
      sealPrivateKey(emma.privateKeyPkcs8, code),
    ]);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.blob).not.toBe(b.blob);
  });
});

describe("run keys", () => {
  it("round-trips through wrap and unwrap as a non-extractable key", async () => {
    const runKey = await generateRunKey();
    const wrapped = await wrapRunKey(runKey, jonas.publicKey);
    expect(fromBase64(wrapped.wrappedKey)).toHaveLength(12 + 32 + 16);
    expect(fromBase64(wrapped.ephemeralPublicKey)).toHaveLength(65);

    const opened = await unwrapRunKey(wrapped.wrappedKey, wrapped.ephemeralPublicKey, jonas.privateKey);
    expect(opened.extractable).toBe(false);
    const { ciphertext, nonce } = await encryptPhoto(new Blob([JPEG]), runKey, AAD);
    expect(await bytesOf(await decryptPhoto(ciphertext, nonce, opened, AAD))).toEqual(JPEG);
  });

  it("uses a fresh ephemeral key for every wrap", async () => {
    const runKey = await generateRunKey();
    const a = await wrapRunKey(runKey, emma.publicKey);
    const b = await wrapRunKey(runKey, emma.publicKey);
    expect(a.ephemeralPublicKey).not.toBe(b.ephemeralPublicKey);
    expect(a.wrappedKey).not.toBe(b.wrappedKey);
  });

  it("opens only with the recipient's private key", async () => {
    const runKey = await generateRunKey();
    const wrapped = await wrapRunKey(runKey, emma.publicKey);
    await expect(
      unwrapRunKey(wrapped.wrappedKey, wrapped.ephemeralPublicKey, stranger.privateKey),
    ).rejects.toBeInstanceOf(DecryptionError);
    await expect(unwrapRunKey(wrapped.wrappedKey, wrapped.ephemeralPublicKey, jonas.privateKey)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("fails on a tampered wrapped key or a swapped ephemeral key", async () => {
    const runKey = await generateRunKey();
    const wrapped = await wrapRunKey(runKey, emma.publicKey);
    const other = await wrapRunKey(runKey, emma.publicKey);

    const bytes = fromBase64(wrapped.wrappedKey);
    bytes[20] ^= 1;
    await expect(unwrapRunKey(toBase64(bytes), wrapped.ephemeralPublicKey, emma.privateKey)).rejects.toBeInstanceOf(
      DecryptionError,
    );
    await expect(unwrapRunKey(wrapped.wrappedKey, other.ephemeralPublicKey, emma.privateKey)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("rewraps for a new public key, which then decrypts photos sealed with the original", async () => {
    const runKey = await generateRunKey();
    const { ciphertext, nonce } = await encryptPhoto(new Blob([JPEG]), runKey, AAD);
    const forEmma = await wrapRunKey(runKey, emma.publicKey);

    const newPhone = await generateAccountKeys();
    const forNewPhone = await rewrapRunKey(
      forEmma.wrappedKey,
      forEmma.ephemeralPublicKey,
      emma.privateKey,
      newPhone.publicKey,
    );
    const opened = await unwrapRunKey(forNewPhone.wrappedKey, forNewPhone.ephemeralPublicKey, newPhone.privateKey);
    expect(await bytesOf(await decryptPhoto(ciphertext, nonce, opened, AAD))).toEqual(JPEG);

    await expect(
      unwrapRunKey(forNewPhone.wrappedKey, forNewPhone.ephemeralPublicKey, emma.privateKey),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it("refuses to rewrap a key it cannot open", async () => {
    const runKey = await generateRunKey();
    const forEmma = await wrapRunKey(runKey, emma.publicKey);
    await expect(
      rewrapRunKey(forEmma.wrappedKey, forEmma.ephemeralPublicKey, stranger.privateKey, stranger.publicKey),
    ).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe("photos", () => {
  let runKey: CryptoKey;
  let ciphertext: Blob;
  let nonce: string;

  beforeAll(async () => {
    runKey = await generateRunKey();
    ({ ciphertext, nonce } = await encryptPhoto(new Blob([JPEG], { type: "image/jpeg" }), runKey, AAD));
  });

  it("round-trips to a JPEG blob", async () => {
    expect(ciphertext.type).toBe("application/octet-stream");
    expect(ciphertext.size).toBe(JPEG.length + 16);
    expect(fromBase64(nonce)).toHaveLength(12);
    const photo = await decryptPhoto(ciphertext, nonce, runKey, AAD);
    expect(photo.type).toBe("image/jpeg");
    expect(await bytesOf(photo)).toEqual(JPEG);
  });

  it("uses a fresh nonce for each photo", async () => {
    const again = await encryptPhoto(new Blob([JPEG]), runKey, AAD);
    expect(again.nonce).not.toBe(nonce);
  });

  it("fails on a changed byte", async () => {
    const bytes = await bytesOf(ciphertext);
    for (const index of [0, 5, bytes.length - 1]) {
      const tampered = bytes.slice();
      tampered[index] ^= 0x01;
      await expect(decryptPhoto(new Blob([tampered]), nonce, runKey, AAD)).rejects.toBeInstanceOf(DecryptionError);
    }
  });

  it("fails on a truncated ciphertext", async () => {
    const bytes = await bytesOf(ciphertext);
    await expect(decryptPhoto(new Blob([bytes.slice(0, -1)]), nonce, runKey, AAD)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("fails on a wrong nonce", async () => {
    const wrong = fromBase64(nonce);
    wrong[0] ^= 1;
    await expect(decryptPhoto(ciphertext, toBase64(wrong), runKey, AAD)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("fails on a wrong key", async () => {
    const other = await generateRunKey();
    await expect(decryptPhoto(ciphertext, nonce, other, AAD)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("fails on a different aad, so a ciphertext cannot move to another photo or run", async () => {
    await expect(decryptPhoto(ciphertext, nonce, runKey, photoAad("run-1", "photo-2"))).rejects.toBeInstanceOf(
      DecryptionError,
    );
    await expect(decryptPhoto(ciphertext, nonce, runKey, photoAad("run-2", "photo-1"))).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });
});
