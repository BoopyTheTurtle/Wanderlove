import { useEffect, useState } from "react";
import type { Profile, Trail, Stop } from "@wannadoo/core";
import type { Completions } from "../lib/runs";
import type { PreparedPhoto, RunPhoto } from "../lib/photos";
import { StatusBar } from "../components/PhoneFrame";
import { StopPhotos } from "../components/StopPhotos";
import { BackIcon } from "../components/Icons";
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

// One clue per stop, in trail order. A private run renames its stops "s1".."s5" (lib/runSnapshot.ts), so clues go by
// position rather than by stop ID.
const CLUES: Clue[] = [
  { word: "TRUE", num: 1, answer: "19", answerType: "number" },
  { word: "LOVE", num: 2, task: "compliments" },
  { word: "IS BUILT", num: 3, task: "done" },
  { word: "FROM", num: 4, answer: "I LOVE YOU", answerType: "text" },
  { word: "SMALL MOMENTS", num: 5, task: "done" },
];

// Case and extra spaces don't count against an answer.
function normalise(text: string) {
  return text.trim().replace(/\s+/g, " ").toUpperCase();
}

export function SherlockChallengeScreen({
  trail,
  stop,
  runId,
  canAddPhotos,
  completions,
  syncTick,
  me,
  partner,
  runPartnerName,
  onBack,
  onContinue,
  continueLabel,
  onUpload,
  onSkip,
}: {
  trail: Trail;
  stop: Stop;
  runId: string;
  // Open run, or finished within the grace window: the server still takes photos.
  canAddPhotos: boolean;
  completions: Completions;
  syncTick: number;
  me: Profile;
  partner: Profile | null;
  // The partner who shares this run, or null on a solo run.
  runPartnerName: string | null;
  onBack: () => void;
  // Once the stop is done (by either of you): on to the next stop, or the album after the last one.
  onContinue: () => void;
  continueLabel: string;
  onUpload: (prepared: PreparedPhoto) => Promise<RunPhoto>;
  onSkip: () => Promise<void>;
}) {
  const [guess, setGuess] = useState("");
  // Bumped on every wrong guess so the popup replays each time.
  const [nope, setNope] = useState(0);
  const clue = CLUES[trail.stops.findIndex((s) => s.id === stop.id)];
  const [taskDone, setTaskDone] = useState(false);
  const isText = clue?.answerType === "text";
  const done = stop.id in completions;
  // A stop either of you completed counts as solved, so its clue shows and its photos can grow.
  const solved = done || (clue?.answer ? normalise(guess) === normalise(clue.answer) : clue?.task ? taskDone : true);
  const wrong = !solved && (isText ? nope > 0 : guess.length >= (clue?.answer?.length ?? 0));
  const completedCount = trail.stops.filter((s) => s.id in completions).length;
  // Words from solved clues, plus this clue's once it is revealed, in trail order.
  const collected = trail.stops
    .flatMap((s, i) => (s.id in completions || (s.id === stop.id && solved) ? [CLUES[i]?.word] : []))
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

          {clue?.answer && !done && (
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

          {clue?.task === "done" && !solved && (
            <button type="button" className="sh-btn-done" onClick={() => setTaskDone(true)}>
              Done
            </button>
          )}

          {clue?.task === "compliments" && !done && (
            <ComplimentExchange me={me} partner={partner} onDone={() => setTaskDone(true)} />
          )}

          {clue && solved && (
            <div className="sh-reward">
              <span className="sh-reward-label">🔑 Collect the clue</span>
              <span className="sh-reward-word">{clue.word}</span>
            </div>
          )}

          <StopPhotos
            runId={runId}
            stopId={stop.id}
            syncTick={syncTick}
            done={done}
            canAdd={canAddPhotos}
            locked={!solved}
            meId={me.id}
            partnerName={runPartnerName}
            onUpload={onUpload}
            onSkip={onSkip}
          />
          {done && (
            <button type="button" className="sh-btn-done stop-continue" onClick={onContinue}>
              {continueLabel}
            </button>
          )}
          {!done && (
            <p className="sh-hint">
              {solved
                ? "This seals the clue and unlocks the next stop."
                : clue?.answer
                  ? "Solve the code to unlock the camera."
                  : "Finish the task to unlock the camera."}
            </p>
          )}
        </section>

        {/* Mini stamp progress */}
        <div className="sh-progress-row">
          {trail.stops.map((s, i) => (
            <div
              key={s.id}
              className={`sh-mini-stamp ${s.id in completions ? "sh-mini-stamp--done" : s.id === stop.id ? "sh-mini-stamp--current" : "sh-mini-stamp--todo"}`}
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
