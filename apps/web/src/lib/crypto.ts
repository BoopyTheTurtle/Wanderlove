// Browser-side cryptography for end-to-end encrypted photos (docs/photo-encryption.md, sections 2, 3 and 5).
// Pure Web Crypto. Every binary value crosses this API as a base64 string so it stores in a text column.

const subtle = globalThis.crypto.subtle;

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const AES_GCM = "AES-GCM";
const IV_BYTES = 12;
const SALT_BYTES = 16;
const PBKDF2_ITERATIONS = 210_000;
const RUN_KEY_INFO = new TextEncoder().encode("wannadoo run key v1");

// Thrown when a recovery code fails to open a sealed private key.
export class WrongRecoveryCodeError extends Error {
  constructor() {
    super("The recovery code does not match.");
    this.name = "WrongRecoveryCodeError";
  }
}

// Thrown when a wrapped run key or a photo fails to decrypt: wrong key, wrong nonce or context, or tampered bytes.
export class DecryptionError extends Error {
  constructor(what: string) {
    super(`Could not decrypt the ${what}.`);
    this.name = "DecryptionError";
  }
}

// ---------- base64 ----------

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

// ---------- account key pair ----------

export type AccountKeys = {
  // Raw P-256 public key, base64. Published in user_keys.
  publicKey: string;
  // First 16 hex characters of SHA-256 over the raw public key.
  keyId: string;
  // PKCS#8 private key, base64, for sealing with the recovery code. Never store it unsealed.
  privateKeyPkcs8: string;
  // The same private key, non-extractable, for everyday use and the device key store.
  privateKey: CryptoKey;
};

export async function generateAccountKeys(): Promise<AccountKeys> {
  const pair = await subtle.generateKey(ECDH, true, ["deriveBits"]);
  const rawPublic = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  const pkcs8 = new Uint8Array(await subtle.exportKey("pkcs8", pair.privateKey));
  const privateKeyPkcs8 = toBase64(pkcs8);
  return {
    publicKey: toBase64(rawPublic),
    keyId: await keyIdFor(toBase64(rawPublic)),
    privateKeyPkcs8,
    privateKey: await importPrivateKey(privateKeyPkcs8),
  };
}

export async function keyIdFor(publicKey: string): Promise<string> {
  const digest = new Uint8Array(await subtle.digest("SHA-256", fromBase64(publicKey)));
  return Array.from(digest.subarray(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function importPublicKey(publicKey: string): Promise<CryptoKey> {
  return subtle.importKey("raw", fromBase64(publicKey), ECDH, true, []);
}

// Imports a PKCS#8 private key as non-extractable: the page can use it but never read it back.
export function importPrivateKey(pkcs8: string): Promise<CryptoKey> {
  return subtle.importKey("pkcs8", fromBase64(pkcs8), ECDH, false, ["deriveBits"]);
}

// ---------- recovery code (option A) ----------

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_CODE_LENGTH = 24;
const RECOVERY_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{24}$/;

// 24 Crockford base32 characters: 15 random bytes, 120 bits. Returned normalised, without dashes.
export function generateRecoveryCode(): string {
  const bytes = randomBytes(15);
  let code = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      code += CROCKFORD[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return code;
}

// Tidies a typed or pasted code like invite codes: case, spaces and dashes don't matter, and O, I and L read as
// the digits they resemble.
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function isCompleteRecoveryCode(code: string): boolean {
  return RECOVERY_CODE_PATTERN.test(normalizeRecoveryCode(code));
}

// Groups a code for display: ABCD-EFGH-JKMN-PQRS-TVWX-YZ01.
export function formatRecoveryCode(code: string): string {
  const clean = normalizeRecoveryCode(code);
  if (clean.length !== RECOVERY_CODE_LENGTH) return code;
  return clean.match(/.{4}/g)!.join("-");
}

export type SealedPrivateKey = { blob: string; salt: string; iv: string };

async function recoveryKey(code: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const password = new TextEncoder().encode(normalizeRecoveryCode(code));
  const base = await subtle.importKey("raw", password, "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    base,
    { name: AES_GCM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Encrypts a PKCS#8 private key (base64) with a key derived from the recovery code, for storage on the server.
export async function sealPrivateKey(pkcs8: string, code: string): Promise<SealedPrivateKey> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await recoveryKey(code, salt);
  const blob = new Uint8Array(await subtle.encrypt({ name: AES_GCM, iv }, key, fromBase64(pkcs8)));
  return { blob: toBase64(blob), salt: toBase64(salt), iv: toBase64(iv) };
}

// Returns the PKCS#8 private key (base64); pass it to importPrivateKey. Throws WrongRecoveryCodeError on a wrong code.
export async function openPrivateKey(sealed: SealedPrivateKey, code: string): Promise<string> {
  const key = await recoveryKey(code, fromBase64(sealed.salt));
  try {
    const pkcs8 = await subtle.decrypt({ name: AES_GCM, iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.blob));
    return toBase64(new Uint8Array(pkcs8));
  } catch {
    throw new WrongRecoveryCodeError();
  }
}

// ---------- run keys ----------

export type WrappedRunKey = { wrappedKey: string; ephemeralPublicKey: string };

// A fresh run key. Extractable so the starting phone can wrap it for each member; unwrapRunKey returns
// non-extractable copies.
export function generateRunKey(): Promise<CryptoKey> {
  return subtle.generateKey({ name: AES_GCM, length: 256 }, true, ["encrypt", "decrypt"]);
}

// ECDH between one private and one public key, then HKDF-SHA-256 into an AES-GCM key that wraps the run key.
async function wrappingKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  ephemeralPublicRaw: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const shared = await subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const hkdf = await subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: ephemeralPublicRaw, info: RUN_KEY_INFO },
    hkdf,
    { name: AES_GCM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function wrapRaw(rawRunKey: Uint8Array<ArrayBuffer>, recipientPublicKey: string): Promise<WrappedRunKey> {
  const recipient = await importPublicKey(recipientPublicKey);
  const ephemeral = await subtle.generateKey(ECDH, true, ["deriveBits"]);
  const ephemeralRaw = new Uint8Array(await subtle.exportKey("raw", ephemeral.publicKey));
  const key = await wrappingKey(ephemeral.privateKey, recipient, ephemeralRaw);
  const iv = randomBytes(IV_BYTES);
  const sealed = new Uint8Array(await subtle.encrypt({ name: AES_GCM, iv }, key, rawRunKey));
  return { wrappedKey: toBase64(concat(iv, sealed)), ephemeralPublicKey: toBase64(ephemeralRaw) };
}

async function unwrapRaw(wrapped: WrappedRunKey, myPrivateKey: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const ephemeralRaw = fromBase64(wrapped.ephemeralPublicKey);
    const ephemeral = await subtle.importKey("raw", ephemeralRaw, ECDH, false, []);
    const key = await wrappingKey(myPrivateKey, ephemeral, ephemeralRaw);
    const bytes = fromBase64(wrapped.wrappedKey);
    const raw = await subtle.decrypt({ name: AES_GCM, iv: bytes.subarray(0, IV_BYTES) }, key, bytes.subarray(IV_BYTES));
    return new Uint8Array(raw);
  } catch {
    throw new DecryptionError("run key");
  }
}

// Wraps a run key for one member, identified by their raw public key (base64). The 12-byte IV leads wrappedKey.
export async function wrapRunKey(runKey: CryptoKey, recipientPublicKey: string): Promise<WrappedRunKey> {
  const raw = new Uint8Array(await subtle.exportKey("raw", runKey));
  return wrapRaw(raw, recipientPublicKey);
}

// Opens my wrapped copy of a run key as a non-extractable AES-GCM key for photos.
export async function unwrapRunKey(
  wrappedKey: string,
  ephemeralPublicKey: string,
  myPrivateKey: CryptoKey,
): Promise<CryptoKey> {
  const raw = await unwrapRaw({ wrappedKey, ephemeralPublicKey }, myPrivateKey);
  return subtle.importKey("raw", raw, AES_GCM, false, ["encrypt", "decrypt"]);
}

// Partner re-share (option C): opens my copy of a run key and wraps it for a new public key. The raw key never
// leaves this function.
export async function rewrapRunKey(
  wrappedKey: string,
  ephemeralPublicKey: string,
  myPrivateKey: CryptoKey,
  newRecipientPublicKey: string,
): Promise<WrappedRunKey> {
  const raw = await unwrapRaw({ wrappedKey, ephemeralPublicKey }, myPrivateKey);
  try {
    return await wrapRaw(raw, newRecipientPublicKey);
  } finally {
    raw.fill(0);
  }
}

// ---------- photos ----------

// The additional authenticated data for a photo, so a ciphertext cannot move to another photo or run.
export function photoAad(runId: string, photoId: string): string {
  return `${runId}/${photoId}`;
}

export async function encryptPhoto(
  photo: Blob,
  runKey: CryptoKey,
  aad: string,
): Promise<{ ciphertext: Blob; nonce: string }> {
  const nonce = randomBytes(IV_BYTES);
  const plain = new Uint8Array(await photo.arrayBuffer());
  const sealed = await subtle.encrypt(
    { name: AES_GCM, iv: nonce, additionalData: new TextEncoder().encode(aad) },
    runKey,
    plain,
  );
  return { ciphertext: new Blob([sealed], { type: "application/octet-stream" }), nonce: toBase64(nonce) };
}

// Returns the JPEG. Throws DecryptionError on a wrong key, nonce or aad, or on any changed byte.
export async function decryptPhoto(ciphertext: Blob, nonce: string, runKey: CryptoKey, aad: string): Promise<Blob> {
  const sealed = new Uint8Array(await ciphertext.arrayBuffer());
  try {
    const plain = await subtle.decrypt(
      { name: AES_GCM, iv: fromBase64(nonce), additionalData: new TextEncoder().encode(aad) },
      runKey,
      sealed,
    );
    return new Blob([plain], { type: "image/jpeg" });
  } catch {
    throw new DecryptionError("photo");
  }
}
