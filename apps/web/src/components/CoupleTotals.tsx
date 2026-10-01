import { useCallback, useEffect, useRef, useState } from "react";
import { loadCoupleName, loadCoupleTotals, onForeground } from "../lib/coupleStats";
import type { CoupleTotals } from "../lib/coupleStats";
import "./couple.css";

// The couple's lifetime totals on Home, under their name when they have one. It counts what the two did together and
// never says which partner did what (abuse-threat-model.md, M2). Loads on mount and on returning to the foreground.
export function CoupleTotalsCard() {
  const [shown, setShown] = useState<{ name: string | null; totals: CoupleTotals } | null>(null);
  const loading = useRef(false);

  const reload = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const [couple, totals] = await Promise.all([loadCoupleName(), loadCoupleTotals()]);
      setShown({ name: couple?.name ?? null, totals });
    } catch (e) {
      // Keeps the last totals; the next foreground tries again.
      console.error("Couldn't load the couple's totals", e);
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    void reload();
    return onForeground(() => void reload());
  }, [reload]);

  if (!shown) return null;
  return <CoupleTotalsView name={shown.name} totals={shown.totals} />;
}

export function CoupleTotalsView({ name, totals }: { name: string | null; totals: CoupleTotals }) {
  return (
    <section className="couple-totals" aria-label={name ? `${name}: your progress together` : "Your progress together"}>
      {name && <p className="couple-totals-name">{name}</p>}
      <dl>
        <Stat value={totals.questsDone} one="quest done" many="quests done" />
        <Stat value={totals.photosTaken} one="photo taken" many="photos taken" />
        <Stat value={totals.challengesDone} one="challenge done" many="challenges done" />
      </dl>
    </section>
  );
}

function Stat({ value, one, many }: { value: number; one: string; many: string }) {
  return (
    <div>
      <dt>{value === 1 ? one : many}</dt>
      <dd>{value.toLocaleString("en-GB")}</dd>
    </div>
  );
}
