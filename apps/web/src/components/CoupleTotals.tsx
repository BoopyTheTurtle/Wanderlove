import { useCallback, useEffect, useRef, useState } from "react";
import { loadCoupleName, onForeground } from "../lib/coupleStats";
import type { CoupleTotals } from "../lib/coupleStats";
import "./couple.css";

// The couple's lifetime totals on Home, under their name when they have one. It counts what the two did together and
// never says which partner did what (abuse-threat-model.md, M2). Home loads the totals; the card loads the name, on
// mount and on returning to the foreground. Nothing shows until both have had their first try, so the name doesn't
// pop in above the numbers.
export function CoupleTotalsCard({ totals }: { totals: CoupleTotals | null }) {
  // undefined until the first try ends; a failed try shows the card without a name.
  const [name, setName] = useState<string | null | undefined>(undefined);
  const loading = useRef(false);

  const reload = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const couple = await loadCoupleName();
      setName(couple?.name ?? null);
    } catch (e) {
      // Keeps the last name; the next foreground tries again.
      console.error("Couldn't load the couple's name", e);
      setName((n) => (n === undefined ? null : n));
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    void reload();
    return onForeground(() => void reload());
  }, [reload]);

  if (!totals || name === undefined) return null;
  return <CoupleTotalsView name={name} totals={totals} />;
}

export function CoupleTotalsView({ name, totals }: { name: string | null; totals: CoupleTotals }) {
  return (
    <section className="couple-totals" aria-label={name ? `${name}: your progress together` : "Your progress together"}>
      {name && <p className="couple-totals-name">{name}</p>}
      <dl>
        <Stat value={totals.questsDone} one="quest done" many="quests done" />
        <Stat value={totals.photosTaken} one="photo taken" many="photos taken" />
        <Stat value={totals.challengesDone} one="challenge done" many="challenges done" />
        <Stat value={totals.points} one="point" many="points" />
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
