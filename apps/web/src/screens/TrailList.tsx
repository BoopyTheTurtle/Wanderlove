import { StatusBar } from "../components/PhoneFrame";
import { BackIcon, ChevronIcon, ClockIcon, CompassIcon, HeartIcon, PinIcon, SparkIcon } from "../components/Icons";
import type { Trail } from "@wannadoo/core";
import { MAX_ROUTE_METERS } from "@wannadoo/core";

export function TrailList({
  curated,
  activeTrail,
  onBack,
  onContinue,
  onSelectSurprise,
  onSelectCurated,
}: {
  curated: Trail;
  activeTrail: Trail | null;
  onBack: () => void;
  onContinue: () => void;
  onSelectSurprise: () => void;
  onSelectCurated: () => void;
}) {
  return (
    <div className="screen light-screen">
      <StatusBar />
      <div className="page-head">
        <button type="button" className="icon-button" onClick={onBack} aria-label="Back">
          <BackIcon />
        </button>
        <div>
          <p className="eyebrow">Established Couples</p>
          <h2>Trails near you</h2>
        </div>
      </div>

      <div className="chip-row">
        <button type="button" className="chip selected">
          Riga Centre
        </button>
        <button type="button" className="chip">
          Outdoors
        </button>
        <button type="button" className="chip">
          Evening
        </button>
        <button type="button" className="chip">
          Under 90 min
        </button>
      </div>

      <div className="trail-list">
        {activeTrail && (
          <button type="button" className="mode-card continue-card" onClick={onContinue}>
            <span className="continue-icon">
              <CompassIcon size={24} />
            </span>
            <span className="mode-copy">
              <small>In progress</small>
              <strong>{activeTrail.name}</strong>
            </span>
            <span className="mode-arrow">
              <ChevronIcon size={18} />
            </span>
          </button>
        )}

        <button type="button" className="trail-card surprise-card" onClick={onSelectSurprise}>
          <div className="surprise-art" aria-hidden="true">
            <SparkIcon size={40} />
            <span className="tag-pill on-image">
              <SparkIcon size={12} /> New every time
            </span>
          </div>
          <div className="trail-copy">
            <p className="eyebrow">From where you are</p>
            <h3>Surprise Route</h3>
            <p className="trail-desc">
              A random walking loop of 4–6 spots near you. Don&rsquo;t like it? Roll a new one before you start.
            </p>
            <div className="meta-row">
              <span className="meta-pill">
                <PinIcon size={13} /> Up to {(MAX_ROUTE_METERS / 1000).toFixed(1)} km
              </span>
              <span className="meta-pill">
                <ClockIcon size={13} /> 40–70 min
              </span>
            </div>
          </div>
        </button>

        <button type="button" className="trail-card" onClick={onSelectCurated}>
          <div className="trail-image">
            <img src={curated.coverImage} alt="" />
            {curated.curatorPick && (
              <span className="tag-pill on-image">
                <SparkIcon size={12} /> Curator pick
              </span>
            )}
            <span className="heart-button">
              <HeartIcon size={16} />
            </span>
          </div>
          <div className="trail-copy">
            <p className="eyebrow">{curated.location}</p>
            <h3>{curated.name}</h3>
            <p className="trail-desc">{curated.description}</p>
            <div className="meta-row">
              <span className="meta-pill">
                <ClockIcon size={13} /> {curated.durationMinutes} min
              </span>
              <span className="meta-pill">
                <PinIcon size={13} /> {curated.stopCount} stops
              </span>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
