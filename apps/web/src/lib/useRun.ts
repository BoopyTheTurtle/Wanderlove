import { useCallback, useEffect, useState } from "react";
import { loadRun, type Run } from "./runs";

export type LoadedRun =
  | { status: "loading"; retry: () => void }
  | { status: "error"; retry: () => void }
  | { status: "ready"; run: Run; retry: () => void };

// One run, open or ended, loaded from the server; `refreshKey` reloads it. A failed refresh keeps the run on screen.
export function useRun(runId: string, refreshKey: number): LoadedRun {
  const [state, setState] = useState<{ status: "loading" | "error" } | { status: "ready"; run: Run }>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    loadRun(runId).then(
      (run) => {
        if (!current) return;
        if (run) setState({ status: "ready", run });
        else setState((s) => (s.status === "ready" ? s : { status: "error" }));
      },
      (e: unknown) => {
        console.error("Couldn't load the run", e);
        if (current) setState((s) => (s.status === "ready" ? s : { status: "error" }));
      },
    );
    return () => {
      current = false;
    };
  }, [runId, refreshKey, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}
