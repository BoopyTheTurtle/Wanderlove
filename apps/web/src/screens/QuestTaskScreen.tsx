import { useState } from "react";
import type { Completions } from "../lib/runs";
import type { PreparedPhoto, RunPhoto } from "../lib/photos";
import { StatusBar } from "../components/PhoneFrame";
import { StopPhotos } from "../components/StopPhotos";
import { BackIcon, CameraIcon, ChatIcon, ClockIcon, HeartIcon } from "../components/Icons";
import { QUIET_STOP_LINE } from "../lib/routeSafety";
import "../route-safety.css";
import "../quest-task.css";

// TODO: import QuestTask from @wannadoo/core once feature/quest-core merges, and drop this local copy of its shape.
export type QuestTaskView = {
  id: string;
  category: "intro" | "silly" | "deep" | "wrapup";
  title: string;
  prompt: string;
  steps: string[];
  photoHint: string;
  tags: string[];
  minutes: number;
};

// How each category introduces itself (docs/research/task-design-guide.md, section 2).
const CATEGORY: Record<QuestTaskView["category"], { label: string; note: string | null }> = {
  intro: { label: "Warm-up", note: null },
  silly: {
    label: "Silly game",
    note: "A small version is fine: whisper instead of singing, a tiny pose instead of a big one.",
  },
  deep: { label: "Deep talk", note: "If there's a bench nearby, sit down for this one. Take your time." },
  wrapup: { label: "Wrap-up", note: null },
};

// One stop of a random quest: the task for its category, then the photo. Sherlock keeps its own screens.
export function QuestTaskScreen({
  task,
  stopNumber,
  stopCount = 5,
  stopId,
  stopName,
  stopImage,
  quiet = false,
  runId,
  canAddPhotos,
  completions,
  syncTick,
  meId,
  partnerName,
  onBack,
  onContinue,
  continueLabel,
  onUpload,
  onSkip,
  onSkipTask,
}: {
  task: QuestTaskView;
  stopNumber: number; // 1 to stopCount
  stopCount?: number;
  stopId: string;
  stopName: string;
  stopImage?: string;
  // A place of remembrance (docs/research/route-safety.md, section 4).
  quiet?: boolean;
  runId: string;
  // Open run, or finished within the grace window: the server still takes photos.
  canAddPhotos: boolean;
  completions: Completions;
  syncTick: number;
  meId: string;
  partnerName: string | null;
  onBack: () => void;
  // Once the stop is done (by either of you): on to the next stop, or the album after the last one.
  onContinue: () => void;
  continueLabel: string;
  onUpload: (prepared: PreparedPhoto) => Promise<RunPhoto>;
  // Skip photo: completes the stop without one.
  onSkip: () => Promise<void>;
  // Skip the task: the stop still counts, with no penalty.
  onSkipTask: () => Promise<void>;
}) {
  const completion = completions[stopId];
  const done = completion !== undefined;
  const byPartner = done && completion.by !== meId;
  const completedCount = Math.min(Object.keys(completions).length, stopCount);
  const pct = Math.round((completedCount / stopCount) * 100);
  const category = CATEGORY[task.category];
  const headingId = `quest-task-${task.id}`;

  const [skipping, setSkipping] = useState(false);
  const [skipFailed, setSkipFailed] = useState(false);

  async function skipTask() {
    setSkipping(true);
    setSkipFailed(false);
    try {
      await onSkipTask();
    } catch {
      setSkipFailed(true);
    } finally {
      setSkipping(false);
    }
  }

  return (
    <div className={`screen challenge-screen quest-task quest-task-${task.category}`}>
      <div className={stopImage ? "challenge-hero" : "challenge-hero quest-task-hero-plain"}>
        {stopImage && <img src={stopImage} alt="" />}
        {stopImage && <span className="hero-shade" />}
        <StatusBar light />
        <button type="button" className="hero-button back" onClick={onBack} aria-label="Back to map">
          <BackIcon size={20} />
        </button>
        <span className="hero-pin" aria-hidden="true">
          <HeartIcon size={20} filled />
        </span>
        <p className="quest-task-place">{stopName}</p>
      </div>

      <div className="challenge-sheet">
        <section className="card task-card" aria-labelledby={headingId}>
          <p className="quest-task-eyebrow">
            Stop {stopNumber} · {category.label}
          </p>
          <h2 id={headingId}>{task.title}</h2>
          <div className="meta-row">
            <span className="meta-pill">
              <ClockIcon size={13} /> About {task.minutes} min
            </span>
          </div>
          {quiet && <p className="quiet-note">{QUIET_STOP_LINE}</p>}

          <div className="prompt-box">
            <ChatIcon size={18} />
            <p>{task.prompt}</p>
          </div>

          {task.steps.length > 0 && (
            <div className="quest-task-steps">
              <h3>How to play</h3>
              <ol>
                {task.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {category.note && <p className="quest-task-note">{category.note}</p>}

          {byPartner && (
            <p className="quest-task-partner" role="status">
              {partnerName ?? "Your partner"} finished this stop.
            </p>
          )}

          {(canAddPhotos || !done) && (
            <p className="quest-task-photo-hint">
              <CameraIcon size={15} />
              <span>
                <b>Photo idea:</b> {task.photoHint}
              </span>
            </p>
          )}

          <StopPhotos
            runId={runId}
            stopId={stopId}
            syncTick={syncTick}
            done={done}
            canAdd={canAddPhotos}
            meId={meId}
            partnerName={partnerName}
            onUpload={onUpload}
            onSkip={onSkip}
          />
          {done && (
            <button type="button" className="btn-primary stop-continue" onClick={onContinue}>
              {continueLabel}
            </button>
          )}
          {!done && (
            <div className="quest-task-skip">
              <p>Not feeling this one? Skip it and the stop still counts.</p>
              <button type="button" className="text-button" disabled={skipping} onClick={() => void skipTask()}>
                {skipping ? "Saving…" : "Skip this task"}
              </button>
              {skipFailed && (
                <p className="photo-capture-error" role="alert">
                  Couldn&rsquo;t save the stop. Check your connection and try again.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="level-strip" aria-label="Quest progress">
          <div>
            <b>Quest progress</b>
            <span>
              {completedCount} / {stopCount} stops
            </span>
            <div className="bar">
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
