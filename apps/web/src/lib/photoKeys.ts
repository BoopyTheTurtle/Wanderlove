import { createContext, useContext } from "react";
import { loadRunKey } from "./keys";
import type { DeviceKeys } from "./keyStore";

// How screens that show, add, or save photos reach a run's photo key (photo-encryption.md, section 3). App.tsx
// provides a loader for the signed-in user's device keys; the keys never pass through the screens themselves.

// The run's photo key, or null for a plain run. Rejects with RunKeyPendingError while this phone's copy waits for the
// partner's re-share, and with DecryptionError on a damaged wrap (lib/keys.ts, loadRunKey).
export type RunKeyLoader = (runId: string) => Promise<CryptoKey | null>;

export function runKeyLoader(userId: string, keys: DeviceKeys): RunKeyLoader {
  return (runId) => loadRunKey(userId, keys, runId);
}

// Outside a provider there are no keys. Refuse, rather than answer "plain run" and upload a photo unencrypted.
const noKeys: RunKeyLoader = () => Promise.reject(new Error("No photo keys on this screen"));

export const RunKeyContext = createContext<RunKeyLoader>(noKeys);

export function useRunKeyLoader(): RunKeyLoader {
  return useContext(RunKeyContext);
}
