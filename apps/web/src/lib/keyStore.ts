// This device's account keys in IndexedDB, keyed by user ID, and a session cache of unwrapped run keys.
// IndexedDB stores a non-extractable CryptoKey as is, so the private key never exists in readable form here.

export type DeviceKeys = {
  // Non-extractable ECDH P-256 private key.
  privateKey: CryptoKey;
  // Raw public key, base64.
  publicKey: string;
  keyId: string;
  // The recovery code that opens the sealed private key, normalized, for Settings to show. Whoever holds this device
  // holds the private key already, so keeping the code here reveals nothing more.
  recoveryCode?: string;
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
