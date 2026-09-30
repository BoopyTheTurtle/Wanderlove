import { describe, expect, it, vi } from "vitest";
import { DecryptionError, generateRunKey } from "./crypto";
import { RunWithoutKeysError, openStoredPhoto, photoPath, sealPhoto } from "./photos";

// The helpers under test are pure; the client module only needs env vars that tests don't have.
vi.mock("./supabase", () => ({ supabase: {} }));

const RUN = "11111111-1111-4111-8111-111111111111";
const PHOTO = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9])], { type: "image/jpeg" });

async function bytes(blob: Blob) {
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

describe("photoPath", () => {
  it("stores plain photos as .jpg and encrypted ones as .bin", () => {
    expect(photoPath(RUN, PHOTO, false)).toBe(`${RUN}/${PHOTO}.jpg`);
    expect(photoPath(RUN, PHOTO, true)).toBe(`${RUN}/${PHOTO}.bin`);
  });
});

describe("sealPhoto", () => {
  it("refuses a run without a key rather than upload the JPEG in the clear", async () => {
    await expect(sealPhoto(RUN, PHOTO, jpeg, null)).rejects.toBeInstanceOf(RunWithoutKeysError);
  });

  it("encrypts on a run with a key, and opens again to the same JPEG", async () => {
    const key = await generateRunKey();
    const sealed = await sealPhoto(RUN, PHOTO, jpeg, key);
    expect(sealed.path).toBe(`${RUN}/${PHOTO}.bin`);
    expect(sealed.contentType).toBe("application/octet-stream");
    expect(sealed.nonce).toEqual(expect.any(String));
    expect(await bytes(sealed.body)).not.toEqual(await bytes(jpeg));

    const opened = await openStoredPhoto({ id: PHOTO, runId: RUN, nonce: sealed.nonce }, sealed.body, key);
    expect(opened.type).toBe("image/jpeg");
    expect(await bytes(opened)).toEqual(await bytes(jpeg));
  });

  it("gives every photo a fresh nonce", async () => {
    const key = await generateRunKey();
    const a = await sealPhoto(RUN, PHOTO, jpeg, key);
    const b = await sealPhoto(RUN, PHOTO, jpeg, key);
    expect(a.nonce).not.toBe(b.nonce);
  });
});

describe("openStoredPhoto", () => {
  it("passes a plain photo through as a JPEG", async () => {
    const stored = new Blob([await jpeg.arrayBuffer()]);
    const opened = await openStoredPhoto({ id: PHOTO, runId: RUN, nonce: null }, stored, null);
    expect(opened.type).toBe("image/jpeg");
    expect(await bytes(opened)).toEqual(await bytes(jpeg));
  });

  it("refuses a ciphertext moved to another photo or run", async () => {
    const key = await generateRunKey();
    const { body, nonce } = await sealPhoto(RUN, PHOTO, jpeg, key);
    await expect(openStoredPhoto({ id: OTHER, runId: RUN, nonce }, body, key)).rejects.toBeInstanceOf(DecryptionError);
    await expect(openStoredPhoto({ id: PHOTO, runId: OTHER, nonce }, body, key)).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it("refuses an encrypted photo without the key or with another run's key", async () => {
    const key = await generateRunKey();
    const { body, nonce } = await sealPhoto(RUN, PHOTO, jpeg, key);
    await expect(openStoredPhoto({ id: PHOTO, runId: RUN, nonce }, body, null)).rejects.toBeInstanceOf(DecryptionError);
    await expect(
      openStoredPhoto({ id: PHOTO, runId: RUN, nonce }, body, await generateRunKey()),
    ).rejects.toBeInstanceOf(DecryptionError);
  });
});
