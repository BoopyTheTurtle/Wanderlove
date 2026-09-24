import { StatusBar } from "../components/PhoneFrame";
import { ShareIcon, CompassIcon } from "../components/Icons";
import type { Trail } from "@wannadoo/core";
import type { Progress } from "../lib/progress";

const CLUE_DATA: { id: string; word: string; num: number }[] = [
  { id: "spikeri-promenade-clue1", word: "TRUE", num: 1 },
  { id: "spikeri-warehouses-clue2", word: "LOVE IS", num: 2 },
  { id: "spikeri-square-clue3", word: "BUILT", num: 3 },
  { id: "spikeri-creative-quarter-clue4", word: "ON", num: 4 },
  { id: "daugava-bench-clue5", word: "SMALL MOMENTS", num: 5 },
];

export function SherlockCompleteScreen({
  trail,
  progress,
  onViewMap,
}: {
  trail: Trail;
  progress: Progress;
  onViewMap: () => void;
}) {
  const allDone = trail.stops.every((s) => progress[s.id]);

  async function handleShare() {
    const shareData = { title: trail.name, text: "We solved the Sherlock Holmes mystery in Spīķeri on Wannadoo." };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled
      }
    }
  }

  return (
    <div className="screen sh-complete-screen">
      <StatusBar />

      <div className="sh-complete-inner">
        {/* Field book header */}
        <p className="sh-field-eyebrow">Your field book</p>
        <h1 className="sh-field-title">Passport to us</h1>

        {/* Collected curiosities */}
        <section className="sh-passport">
          <div className="sh-passport-head">
            <span className="sh-passport-issue">Case no. 221B · Riga</span>
            <span className="sh-curiosities-label">Our collected curiosities</span>
          </div>
          <div className="sh-stamp-grid">
            {CLUE_DATA.map(({ id, word, num }) => {
              const done = !!progress[id];
              return (
                <div key={id} className={`sh-stamp-cell ${done ? "sh-stamp-cell--done" : "sh-stamp-cell--todo"}`}>
                  <span className="sh-stamp-cell-num">0{num}</span>
                  <span className="sh-stamp-cell-word">{done ? word : "Still out there"}</span>
                </div>
              );
            })}
          </div>
          <button type="button" className="sh-passport-foot" onClick={onViewMap}>
            <CompassIcon size={16} /> Back to our map
          </button>
        </section>

        {/* Revealed message */}
        {allDone && (
          <div className="sh-reveal">
            <p className="sh-reveal-label">The Lost Letter Reveals…</p>
            <blockquote className="sh-reveal-quote">"True love is built on small moments."</blockquote>
            <p className="sh-reveal-sub">
              Not grand gestures. Not perfect days. But thousands of shared laughs, walks, and adventures.
            </p>
          </div>
        )}

        {/* Actions */}
        <button type="button" className="sh-btn-ghost" onClick={handleShare}>
          <ShareIcon size={16} /> Share the trail
        </button>
      </div>
    </div>
  );
}
