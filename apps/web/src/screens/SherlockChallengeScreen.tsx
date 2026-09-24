import { useState } from "react";
import type { Trail, Stop } from "@wannadoo/core";
import type { Progress } from "../lib/progress";
import { StatusBar } from "../components/PhoneFrame";
import { BackIcon, CameraIcon } from "../components/Icons";

const CLUE_DATA: Record<string, { word: string; num: number }> = {
  "spikeri-promenade-clue1": { word: "TRUE", num: 1 },
  "spikeri-warehouses-clue2": { word: "LOVE IS", num: 2 },
  "spikeri-square-clue3": { word: "BUILT", num: 3 },
  "spikeri-creative-quarter-clue4": { word: "ON", num: 4 },
  "daugava-bench-clue5": { word: "SMALL MOMENTS", num: 5 },
  "spikeri-courtyard-final": { word: "REVEALED", num: 6 },
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function SherlockChallengeScreen({
  trail,
  stop,
  progress,
  onBack,
  onCapture,
}: {
  trail: Trail;
  stop: Stop;
  progress: Progress;
  onBack: () => void;
  onCapture: (stopId: string, photoDataUrl: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const clue = CLUE_DATA[stop.id];
  const completedCount = trail.stops.filter((s) => progress[s.id]).length;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onCapture(stop.id, dataUrl);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen sh-screen">
      {/* Header */}
      <div className="sh-header">
        <StatusBar light />
        <button type="button" className="sh-back" onClick={onBack} aria-label="Back to map">
          <BackIcon size={20} />
        </button>

        <div className="sh-stamp-hero">
          <div className="sh-stamp-ring">
            <span className="sh-stamp-num">0{clue?.num ?? "?"}</span>
          </div>
        </div>

        <p className="sh-clue-label">{stop.eyebrow.toUpperCase()}</p>
        <h2 className="sh-location-name">{stop.name}</h2>
      </div>

      {/* Content */}
      <div className="sh-sheet">
        <section className="sh-card">
          <span className="sh-eyebrow-label">The Challenge</span>
          <p className="sh-challenge-text">{stop.prompt}</p>

          {clue && (
            <div className="sh-reward">
              <span className="sh-reward-label">🔑 Collect the word</span>
              <span className="sh-reward-word">{clue.word}</span>
            </div>
          )}

          <label className="sh-btn-primary">
            <CameraIcon size={18} />
            {busy ? "Saving…" : "Capture the moment"}
            <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} hidden />
          </label>
          <p className="sh-hint">This seals the clue and unlocks the next stop.</p>
        </section>

        {/* Mini stamp progress */}
        <div className="sh-progress-row">
          {trail.stops.map((s, i) => (
            <div
              key={s.id}
              className={`sh-mini-stamp ${progress[s.id] ? "sh-mini-stamp--done" : s.id === stop.id ? "sh-mini-stamp--current" : "sh-mini-stamp--todo"}`}
            >
              <span>0{i + 1}</span>
            </div>
          ))}
        </div>
        <p className="sh-progress-label">
          {completedCount} of {trail.stops.length} clues solved
        </p>
      </div>
    </div>
  );
}
