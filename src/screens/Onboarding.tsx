import { StatusBar } from "../components/PhoneFrame";

type Mode = {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  image: string;
  className?: string;
  enabled: boolean;
};

const MODES: Mode[] = [
  {
    id: "first-dates",
    number: "01",
    title: "First Dates",
    subtitle: "Easy chemistry, no awkward silences.",
    image:
      "https://picsum.photos/seed/wanderclue-mode-first-dates/800/800",
    enabled: false,
  },
  {
    id: "established-couples",
    number: "02",
    title: "Established Couples",
    subtitle: "See your city — and each other — anew.",
    image:
      "https://picsum.photos/seed/wanderclue-mode-established/800/800",
    className: "mode-2",
    enabled: true,
  },
  {
    id: "traveling",
    number: "03",
    title: "Traveling",
    subtitle: "Turn a new place into a story.",
    image:
      "https://picsum.photos/seed/wanderclue-mode-traveling/800/800",
    className: "mode-3",
    enabled: false,
  },
];

export function Onboarding({ onSelectMode }: { onSelectMode: (modeId: string) => void }) {
  return (
    <div className="screen onboarding">
      <StatusBar />
      <div className="onboarding-head">
        <div className="brand-mark">
          <span>W</span>
        </div>
        <h1>
          How do you
          <br />
          wander together?
        </h1>
        <p className="intro">
          Choose a mood. We&rsquo;ll turn the city into something worth
          remembering.
        </p>
      </div>
      <div className="mode-list">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={`mode-card ${mode.className ?? ""}`}
            onClick={() => mode.enabled && onSelectMode(mode.id)}
            aria-disabled={!mode.enabled}
          >
            <img src={mode.image} alt="" />
            <span className="mode-shade" />
            <span className="mode-number">{mode.number}</span>
            <span className="mode-copy">
              <strong>{mode.title}</strong>
              <small>{mode.enabled ? mode.subtitle : "Coming soon"}</small>
            </span>
            <span className="mode-arrow">{mode.enabled ? "→" : "–"}</span>
          </button>
        ))}
      </div>
      <p className="onboarding-foot">You can change this any time.</p>
    </div>
  );
}
