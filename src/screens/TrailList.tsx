import { StatusBar } from "../components/PhoneFrame";
import { BackIcon, ClockIcon, HeartIcon, PinIcon, SparkIcon } from "../components/Icons";
import type { Trail } from "../data/trail";

export function TrailList({
  trail,
  onBack,
  onSelectTrail,
}: {
  trail: Trail;
  onBack: () => void;
  onSelectTrail: () => void;
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
        <button type="button" className="trail-card" onClick={onSelectTrail}>
          <div className="trail-image">
            <img src={trail.coverImage} alt="" />
            {trail.curatorPick && (
              <span className="tag-pill on-image">
                <SparkIcon size={12} /> Curator pick
              </span>
            )}
            <span className="heart-button">
              <HeartIcon size={16} />
            </span>
          </div>
          <div className="trail-copy">
            <p className="eyebrow">{trail.location}</p>
            <h3>{trail.name}</h3>
            <p className="trail-desc">{trail.description}</p>
            <div className="meta-row">
              <span className="meta-pill">
                <ClockIcon size={13} /> {trail.durationMinutes} min
              </span>
              <span className="meta-pill">
                <PinIcon size={13} /> {trail.stopCount} stops
              </span>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
