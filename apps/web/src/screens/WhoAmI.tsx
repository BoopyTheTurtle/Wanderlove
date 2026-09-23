import { StatusBar } from "../components/PhoneFrame";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { ChevronIcon } from "../components/Icons";
import { PROFILES } from "@wannadoo/core";

// Dev-only stand-in for sign-in: pick which test profile this device is.
export function WhoAmI({ onPick }: { onPick: (profileId: string) => void }) {
  return (
    <div className="screen light-screen whoami">
      <StatusBar />
      <div className="whoami-head">
        <span className="dev-pill">Test mode</span>
        <h2>Who&rsquo;s using this phone?</h2>
        <p>Pick a test profile. Link to the other one on the next screen.</p>
      </div>
      <div className="mode-list">
        {PROFILES.map((p) => (
          <button key={p.id} type="button" className="mode-card" onClick={() => onPick(p.id)}>
            <ProfileAvatar profile={p} size={56} />
            <span className="mode-copy">
              <strong>{p.name}</strong>
              <small>
                @{p.username} · {p.email}
              </small>
            </span>
            <span className="mode-arrow">
              <ChevronIcon size={18} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
