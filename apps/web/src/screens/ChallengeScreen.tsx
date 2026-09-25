import type { Trail, Stop } from "@wannadoo/core";
import type { Progress } from "../lib/progress";
import { StatusBar } from "../components/PhoneFrame";
import { BackIcon, CameraIcon, ChatIcon, FlagIcon, HeartIcon, PinIcon, QuestionIcon } from "../components/Icons";

export function ChallengeScreen({
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
  const stopIndex = trail.stops.indexOf(stop);
  const completedCount = trail.stops.filter((s) => progress[s.id]).length;
  const pct = Math.round((completedCount / trail.stops.length) * 100);

  // Test build: photo upload is off, so submitting completes the stop without a photo.
  function handleSubmit() {
    onCapture(stop.id, "");
  }

  return (
    <div className="screen challenge-screen">
      <div className="challenge-hero">
        <img src={stop.image} alt="" />
        <span className="hero-shade" />
        <StatusBar light />
        <button type="button" className="hero-button back" onClick={onBack} aria-label="Back to map">
          <BackIcon size={20} />
        </button>
        <span className="hero-button like" aria-hidden="true">
          <HeartIcon size={18} />
        </span>
        <span className="hero-pin" aria-hidden="true">
          <HeartIcon size={20} filled />
        </span>
      </div>

      <div className="challenge-sheet">
        <section className="card task-card">
          <span className="tag-pill">
            <FlagIcon size={12} /> Task
          </span>
          <h2>{stop.name}</h2>
          <p className="task-desc">Answer the prompt together, out loud, then take a photo of the two of you.</p>

          <div className="prompt-box">
            <ChatIcon size={18} />
            <p>{stop.prompt}</p>
          </div>

          <div className="meta-row">
            <span className="meta-pill">
              <PinIcon size={13} /> Stop {stopIndex + 1} of {trail.stops.length}
            </span>
            <span className="meta-pill">{stop.eyebrow.replace(/^Stop \d+\s*—?\s*/, "") || "Challenge"}</span>
          </div>

          <button type="button" className="btn-primary" onClick={handleSubmit}>
            <CameraIcon size={18} />
            Capture the moment
          </button>
          <p className="hint">This unlocks the next stop on the map.</p>
        </section>

        <section className="card quiz-card" aria-disabled="true">
          <div>
            <span className="tag-pill quiz">
              <QuestionIcon size={12} /> Quiz
            </span>
            <h3>Couple Quiz</h3>
            <p>Test how well you know each other.</p>
          </div>
          <div className="quiz-art" aria-hidden="true">
            <span>
              <HeartIcon size={16} filled />
            </span>
            <span>?</span>
            <span>
              <HeartIcon size={12} filled />
            </span>
          </div>
          <button type="button" className="btn-soft" disabled>
            Coming soon
          </button>
        </section>

        <section className="level-strip">
          <div>
            <b>Trail progress</b>
            <span>
              {completedCount} / {trail.stops.length} stops
            </span>
            <div className="bar">
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
          <span className="level-badge" aria-hidden="true">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinejoin="round"
            >
              <path d="m3 19 6-10 4 6 2-3 6 7z" />
            </svg>
          </span>
        </section>
      </div>
    </div>
  );
}
