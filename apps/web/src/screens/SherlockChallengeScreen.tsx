import { useEffect, useState } from "react";
import type { Profile, Trail, Stop } from "@wannadoo/core";
import type { Progress } from "../lib/progress";
import { StatusBar } from "../components/PhoneFrame";
import { BackIcon, CameraIcon } from "../components/Icons";
import { ComplimentExchange } from "./ComplimentExchange";

// A clue with an `answer` or a `task` keeps its word hidden, and the camera locked, until it is solved.
const CLUE_DATA: Record<string, { word: string; num: number; answer?: string; task?: "compliments" }> = {
  "spikeri-promenade-clue1": { word: "TRUE", num: 1, answer: "19" },
  "spikeri-warehouses-clue2": { word: "LOVE IS", num: 2, task: "compliments" },
  "spikeri-square-clue3": { word: "BUILT", num: 3 },
  "spikeri-creative-quarter-clue4": { word: "ON", num: 4 },
  "daugava-bench-clue5": { word: "SMALL MOMENTS", num: 5 },
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
  me,
  partner,
  onBack,
  onCapture,
}: {
  trail: Trail;
  stop: Stop;
  progress: Progress;
  me: Profile | null;
  partner: Profile | null;
  onBack: () => void;
  onCapture: (stopId: string, photoDataUrl: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [guess, setGuess] = useState("");
  // Bumped on every wrong guess so the popup replays each time.
  const [nope, setNope] = useState(0);
  const clue = CLUE_DATA[stop.id];
  const [taskDone, setTaskDone] = useState(false);
  const solved = clue?.answer ? guess === clue.answer : clue?.task ? taskDone : true;
  const wrong = !solved && guess.length >= (clue?.answer?.length ?? 0);
  const completedCount = trail.stops.filter((s) => progress[s.id]).length;

  useEffect(() => {
    if (!nope) return;
    const timer = setTimeout(() => setNope(0), 2400);
    return () => clearTimeout(timer);
  }, [nope]);

  function handleGuess(value: string) {
    const digits = value.replace(/\D/g, "");
    setGuess(digits);
    const answer = clue?.answer ?? "";
    if (digits.length >= answer.length && digits !== answer) setNope((n) => n + 1);
    else setNope(0);
  }

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
      <StatusBar />
      <header className="sh-topbar">
        <button type="button" className="sh-back" onClick={onBack} aria-label="Back to map">
          <BackIcon size={20} />
        </button>
        <p className="sh-kicker">Sherlock&rsquo;s casebook · Spīķeri</p>
      </header>

      <div className="sh-title-row">
        <div>
          <p className="sh-clue-label">{stop.eyebrow}</p>
          <h2 className="sh-location-name">{stop.name}</h2>
        </div>
        <div className="sh-stamp-ring" aria-hidden="true">
          <span className="sh-stamp-num">0{clue?.num ?? "?"}</span>
        </div>
      </div>

      {/* Content */}
      <div className="sh-sheet">
        <section className="sh-card">
          <span className="sh-eyebrow-label">The Challenge</span>
          <p className="sh-challenge-text">{stop.prompt}</p>

          {clue?.answer && (
            <label className="sh-answer">
              <span className="sh-answer-label">Your answer</span>
              <span className="sh-answer-row">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="?"
                  value={guess}
                  onChange={(e) => handleGuess(e.target.value)}
                  className={solved ? "solved" : wrong ? "wrong" : ""}
                  aria-invalid={wrong}
                  readOnly={solved}
                />
                {nope > 0 && (
                  <span key={nope} className="sh-nope" role="status">
                    <span aria-hidden="true">🕵️</span> Not quite right, try again
                  </span>
                )}
              </span>
            </label>
          )}

          {clue?.task === "compliments" && (
            <ComplimentExchange me={me} partner={partner} onDone={() => setTaskDone(true)} />
          )}

          {clue && solved && (
            <div className="sh-reward">
              <span className="sh-reward-label">🔑 Collect the word</span>
              <span className="sh-reward-word">{clue.word}</span>
            </div>
          )}

          <label className={solved ? "sh-btn-primary" : "sh-btn-primary disabled"} aria-disabled={!solved}>
            <CameraIcon size={18} />
            {busy ? "Saving…" : "Capture the moment"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              disabled={!solved}
              hidden
            />
          </label>
          <p className="sh-hint">
            {solved
              ? "This seals the clue and unlocks the next stop."
              : clue?.answer
                ? "Solve the code to unlock the camera."
                : "Finish the task to unlock the camera."}
          </p>
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
