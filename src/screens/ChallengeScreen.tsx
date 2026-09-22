import { useRef, useState } from "react";
import type { Trail, Stop } from "../data/trail";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ChallengeScreen({
  trail,
  stop,
  onBack,
  onCapture,
}: {
  trail: Trail;
  stop: Stop;
  onBack: () => void;
  onCapture: (stopId: string, photoDataUrl: string) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stopIndex = trail.stops.indexOf(stop);

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
    <div className="screen challenge-screen">
      <div className="challenge-nav">
        <button type="button" onClick={onBack}>
          {"←"}
        </button>
        <div>
          <span>Stop</span>
          <strong>
            {stopIndex + 1} of {trail.stops.length}
          </strong>
        </div>
        <span>{flipped ? "Revealed" : "Sealed"}</span>
      </div>

      <div className={`flip-scene ${flipped ? "is-flipped" : ""}`}>
        <div className="flip-card">
          <button
            type="button"
            className="card-face card-back"
            onClick={() => setFlipped(true)}
            aria-label="Reveal challenge"
          >
            <span className="card-corner">{stopIndex + 1}</span>
            <span className="card-corner bottom">{stopIndex + 1}</span>
            <div className="compass-rose">
              <i />
              <b>TAP TO REVEAL</b>
            </div>
            <div className="card-back-title">{stop.name}</div>
            <small>You&rsquo;ve arrived. Open it together.</small>
          </button>

          <div className="card-face card-front">
            <div className="challenge-photo">
              <img src={stop.image} alt="" />
              <span className="challenge-label">{stop.eyebrow}</span>
            </div>
            <div className="revealed-copy">
              <p className="eyebrow">Conversation prompt</p>
              <h2>{stop.name}</h2>
              <p>Answer it together, out loud, before you take the photo.</p>
              <div className="prompt-card">
                <span className="prompt-icon">{"💬"}</span>
                <div>
                  <span>Prompt</span>
                  <strong>{stop.prompt}</strong>
                </div>
              </div>
            </div>
            <div className="challenge-actions">
              <label className="camera-button">
                <span>{"📷"}</span>
                {busy ? "Saving…" : "Capture the moment"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
              </label>
              <p className="reveal-hint">This unlocks the next stop on the map.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
