// Seals small JSON values with a run key, for a private trail's details and summary (docs/private-trails.md,
// section 1). AES-GCM, like photos (lib/crypto.ts), with "<run_id>:<purpose>" as additional data, so a ciphertext
// cannot move to another run or swap places with the run's other ciphertext.
import { DecryptionError, fromBase64, toBase64 } from "./crypto";

const IV_BYTES = 12;

export type SealPurpose = "details" | "summary";
export type Sealed = { ciphertext: string; nonce: string };

function sealAad(runId: string, purpose: SealPurpose): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${runId}:${purpose}`);
}

export async function sealJson(
  value: unknown,
  runKey: CryptoKey,
  runId: string,
  purpose: SealPurpose,
): Promise<Sealed> {
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const sealed = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: sealAad(runId, purpose) },
    runKey,
    plain,
  );
  return { ciphertext: toBase64(new Uint8Array(sealed)), nonce: toBase64(nonce) };
}

// Throws DecryptionError on a wrong key, run, or purpose, on changed bytes, or when the plaintext isn't JSON.
export async function openJson(
  sealed: Sealed,
  runKey: CryptoKey,
  runId: string,
  purpose: SealPurpose,
): Promise<unknown> {
  try {
    const plain = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(sealed.nonce), additionalData: sealAad(runId, purpose) },
      runKey,
      fromBase64(sealed.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as unknown;
  } catch {
    throw new DecryptionError(`trail ${purpose}`);
  }
}
