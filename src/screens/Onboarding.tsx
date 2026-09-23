import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { CoupleAvatar } from "../components/CoupleAvatar";
import { ChevronIcon } from "../components/Icons";

type Mode = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  enabled: boolean;
};

const MODES: Mode[] = [
  {
    id: "first-dates",
    title: "First Dates",
    subtitle: "Easy chemistry, no awkward silences.",
    image: "https://picsum.photos/seed/wanderclue-mode-first-dates/800/800",
    enabled: false,
  },
  {
    id: "established-couples",
    title: "Established Couples",
    subtitle: "See your city — and each other — anew.",
    image: "https://picsum.photos/seed/wanderclue-mode-established/800/800",
    enabled: true,
  },
  {
    id: "traveling",
    title: "Traveling",
    subtitle: "Turn a new place into a story.",
    image: "https://picsum.photos/seed/wanderclue-mode-traveling/800/800",
    enabled: false,
  },
];

export function Onboarding({ onSelectMode }: { onSelectMode: (modeId: string) => void }) {
  return (
    <div className="screen onboarding">
      <StatusBar />
      <div className="onboarding-head">
        <div className="onboarding-avatar">
          <CoupleAvatar size={96} />
        </div>
        <p className="wordmark">
          <BrandMark /> Wanderclue
        </p>
        <h1>How do you wander together?</h1>
        <p className="intro">
          Choose a mood. We&rsquo;ll turn the city into something worth remembering.
        </p>
      </div>

      <div className="mode-list">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`mode-card ${mode.enabled ? "" : "disabled"}`}
            onClick={() => mode.enabled && onSelectMode(mode.id)}
            aria-disabled={!mode.enabled}
          >
            <img src={mode.image} alt="" />
            <span className="mode-copy">
              <strong>{mode.title}</strong>
              <small>{mode.subtitle}</small>
              {!mode.enabled && <span className="soon-pill">Coming soon</span>}
            </span>
            {mode.enabled && (
              <span className="mode-arrow">
                <ChevronIcon size={18} />
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="onboarding-foot">You can change this any time.</p>
    </div>
  );
}
