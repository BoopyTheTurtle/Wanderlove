import { useEffect, useState } from "react";
import type { Profile, Trail, Stop } from "@wannadoo/core";
import type { Progress } from "../lib/progress";
import { StatusBar } from "../components/PhoneFrame";
import { BackIcon, CameraIcon } from "../components/Icons";
import { ComplimentExchange } from "./ComplimentExchange";

type Clue = {
  word: string;
  num: number;
  // A clue with an `answer` or a `task` keeps its word hidden, and the camera locked, until it is solved.
  answer?: string;
  // Number answers check themselves as they are typed; text answers are checked on submit.
  answerType?: "number" | "text";
  task?: "compliments" | "done";
};

const CLUE_DATA: Record<string, Clue> = {
  "spikeri-promenade-clue1": { word: "TRUE", num: 1, answer: "19", answerType: "number" },
  "spikeri-warehouses-clue2": { word: "LOVE", num: 2, task: "compliments" },
  "spikeri-square-clue3": { word: "IS BUILT", num: 3, task: "done" },
  "spikeri-creative-quarter-clue4": { word: "FROM", num: 4, answer: "I LOVE YOU", answerType: "text" },
  "daugava-bench-clue5": { word: "SMALL MOMENTS", num: 5, task: "done" },
};

// Case and extra spaces don't count against an answer.
function normalise(text: string) {
  return text.trim().replace(/\s+/g, " ").toUpperCase();
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
  const [guess, setGuess] = useState("");
  // Bumped on every wrong guess so the popup replays each time.
  const [nope, setNope] = useState(0);
  const clue = CLUE_DATA[stop.id];
  const [taskDone, setTaskDone] = useState(false);
  const isText = clue?.answerType === "text";
  const solved = clue?.answer ? normalise(guess) === normalise(clue.answer) : clue?.task ? taskDone : true;
  const wrong = !solved && (isText ? nope > 0 : guess.length >= (clue?.answer?.length ?? 0));
  const completedCount = trail.stops.filter((s) => progress[s.id]).length;
  // Words from solved clues, plus this clue's once it is revealed, in trail order.
  const collected = trail.stops
    .filter((s) => progress[s.id] || (s.id === stop.id && solved))
    .map((s) => CLUE_DATA[s.id]?.word)
    .filter((w): w is string => !!w);

  useEffect(() => {
    if (!nope) return;
    const timer = setTimeout(() => setNope(0), 2400);
    return () => clearTimeout(timer);
  }, [nope]);

  function handleGuess(value: string) {
    if (isText) {
      setGuess(value);
      setNope(0);
      return;
    }
    const digits = value.replace(/\D/g, "");
    setGuess(digits);
    const answer = clue?.answer ?? "";
    if (digits.length >= answer.length && digits !== answer) setNope((n) => n + 1);
    else setNope(0);
  }

  function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!solved && guess.trim()) setNope((n) => n + 1);
  }

  // Test build: photo upload is off, so submitting completes the stop without a photo.
  function handleSubmit() {
    onCapture(stop.id, "");
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
            <form className="sh-answer" onSubmit={handleCheck}>
              <label className="sh-answer-label" htmlFor="sh-answer-input">
                Your answer
              </label>
              <span className="sh-answer-row">
                <input
                  id="sh-answer-input"
                  type="text"
                  inputMode={isText ? "text" : "numeric"}
                  pattern={isText ? undefined : "[0-9]*"}
                  maxLength={isText ? 30 : undefined}
                  autoComplete="off"
                  autoCapitalize={isText ? "characters" : undefined}
                  placeholder={isText ? "Decoded message" : "?"}
                  value={guess}
                  onChange={(e) => handleGuess(e.target.value)}
                  className={`${isText ? "text" : ""} ${solved ? "solved" : wrong ? "wrong" : ""}`}
                  aria-invalid={wrong}
                  readOnly={solved}
                />
                {isText && !solved && (
                  <button type="submit" className="sh-answer-check" disabled={!guess.trim()}>
                    Check
                  </button>
                )}
              </span>
              {nope > 0 && (
                <span key={nope} className="sh-nope" role="status">
                  <span aria-hidden="true">🕵️</span> Not quite right, try again
                </span>
              )}
            </form>
          )}

          {clue?.task === "done" && !taskDone && (
            <button type="button" className="sh-btn-done" onClick={() => setTaskDone(true)}>
              Done
            </button>
          )}

          {clue?.task === "compliments" && (
            <ComplimentExchange me={me} partner={partner} onDone={() => setTaskDone(true)} />
          )}

          {clue && solved && (
            <div className="sh-reward">
              <span className="sh-reward-label">🔑 Collect the clue</span>
              <span className="sh-reward-word">{clue.word}</span>
            </div>
          )}

          <button
            type="button"
            className={solved ? "sh-btn-primary" : "sh-btn-primary disabled"}
            onClick={handleSubmit}
            disabled={!solved}
          >
            <CameraIcon size={18} />
            Capture the moment
          </button>
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
        {collected.length > 0 && (
          <div className="sh-collected" aria-label="Words collected so far">
            {collected.map((word) => (
              <span key={word} className="sh-collected-word">
                {word}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
