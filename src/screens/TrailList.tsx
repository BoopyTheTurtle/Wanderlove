import { StatusBar } from "../components/PhoneFrame";
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
        <div>
          <p className="eyebrow">Established Couples</p>
          <h2>
            Trails near
            <br />
            you
          </h2>
        </div>
        <button type="button" className="round-button" onClick={onBack}>
          {"←"}
        </button>
      </div>
      <div className="filter-row">
        <button type="button" className="selected">
          Riga Centre
        </button>
        <button type="button">Outdoors</button>
        <button type="button">Evening</button>
        <button type="button">Under 90 min</button>
      </div>
      <div className="trail-list">
        <button type="button" className="trail-card" onClick={onSelectTrail}>
          <div className="trail-image">
            <img src={trail.coverImage} alt="" />
            {trail.curatorPick && <span className="curator-pick">Curator pick</span>}
            <span className="heart-button">{"♡"}</span>
          </div>
          <div className="trail-copy">
            <p>{trail.location}</p>
            <h3>{trail.name}</h3>
            <div className="trail-meta">
              <span>{"⏱"} {trail.durationMinutes} min</span>
              <i />
              <span>{"📍"} {trail.stopCount} stops</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
