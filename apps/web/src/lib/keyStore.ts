// This device's account keys in IndexedDB, keyed by user ID, and a session cache of unwrapped run keys.
// IndexedDB stores a non-extractable CryptoKey as is, so the private key never exists in readable form here.

export type DeviceKeys = {
  // Non-extractable ECDH P-256 private key.
  privateKey: CryptoKey;
  // Raw public key, base64.
  publicKey: string;
  keyId: string;
  // The recovery code that opens the sealed private key, normalized, kept only until the user has seen it once in
  // Profile (security review, finding 3): a code left on the device would let a script in the page carry the private
  // key away for good.
  recoveryCode?: string;
  // A new pair this device is switching to (lib/keys.ts, rotateAccountKeys). Kept beside the current pair until the
  // switch completes, so a failure halfway can resume or leave the current pair working.
  next?: DeviceKeys;
};

const DB_NAME = "wannadoo-keys";
const STORE = "device-keys";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDeviceKeys(userId: string, keys: DeviceKeys): Promise<void> {
  await withStore("readwrite", (store) => store.put(keys, userId));
}

export async function loadDeviceKeys(userId: string): Promise<DeviceKeys | null> {
  const keys = await withStore<DeviceKeys | undefined>("readonly", (store) => store.get(userId));
  return keys ?? null;
}

export async function clearDeviceKeys(userId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(userId));
  clearRunKeys();
}

// Leaving the phone clean: removes the user's keys, and the whole key database once no user's keys remain in it.
export async function forgetDeviceKeys(userId: string): Promise<void> {
  await clearDeviceKeys(userId);
  const left = await withStore<number>("readonly", (store) => store.count());
  if (left > 0) return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // Another tab holds the database open; the empty database stays until it closes, which reveals nothing.
    request.onblocked = () => resolve();
  });
}

// Removes the recovery code from this device once the user has seen it, and returns the keys without it.
export async function forgetRecoveryCode(userId: string): Promise<DeviceKeys | null> {
  const keys = await loadDeviceKeys(userId);
  if (!keys) return null;
  const rest: DeviceKeys = { ...keys };
  delete rest.recoveryCode;
  await saveDeviceKeys(userId, rest);
  return rest;
}

// The one-time hint after a finished trail ("get your recovery code in Profile"), remembered per device and user.
const RECOVERY_HINT_KEY = "wannadoo_recovery_hint_done";

export function recoveryHintDone(userId: string): boolean {
  try {
    const done: unknown = JSON.parse(globalThis.localStorage.getItem(RECOVERY_HINT_KEY) ?? "[]");
    return Array.isArray(done) && done.includes(userId);
  } catch {
    return false;
  }
}

export function markRecoveryHintDone(userId: string): void {
  try {
    const done: unknown = JSON.parse(globalThis.localStorage.getItem(RECOVERY_HINT_KEY) ?? "[]");
    const list = Array.isArray(done) ? done.filter((id) => id !== userId) : [];
    globalThis.localStorage.setItem(RECOVERY_HINT_KEY, JSON.stringify([...list, userId]));
  } catch {
    // Without storage the hint may show again, which is harmless.
  }
}

// Leaving the phone clean: forgets that this user dismissed the hint.
export function forgetRecoveryHint(userId: string): void {
  try {
    const done: unknown = JSON.parse(globalThis.localStorage.getItem(RECOVERY_HINT_KEY) ?? "[]");
    const list = Array.isArray(done) ? done.filter((id) => id !== userId) : [];
    if (list.length === 0) globalThis.localStorage.removeItem(RECOVERY_HINT_KEY);
    else globalThis.localStorage.setItem(RECOVERY_HINT_KEY, JSON.stringify(list));
  } catch {
    // Nothing to forget.
  }
}

// Unwrapped run keys for this session, by run ID. Memory only; gone on reload.
const runKeys = new Map<string, CryptoKey>();

export function getRunKey(runId: string): CryptoKey | undefined {
  return runKeys.get(runId);
}

export function setRunKey(runId: string, key: CryptoKey): void {
  runKeys.set(runId, key);
}

export function clearRunKeys(): void {
  runKeys.clear();
}
