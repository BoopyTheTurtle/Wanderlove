import { StatusBar } from "../components/PhoneFrame";
import { CoupleAvatar } from "../components/CoupleAvatar";
import { CompassIcon, ShareIcon } from "../components/Icons";
import type { Trail } from "../data/trail";
import type { Progress } from "../lib/progress";

export function CompleteScreen({
  trail,
  progress,
  onViewMap,
}: {
  trail: Trail;
  progress: Progress;
  onViewMap: () => void;
}) {
  const photos = trail.stops.map((s) => progress[s.id]?.photoDataUrl).filter(Boolean) as string[];
  const [left, main, right] = [photos[0], photos[photos.length - 1] ?? photos[0], photos[1] ?? photos[0]];

  async function handleShare() {
    const shareData = { title: trail.name, text: `We finished the ${trail.name} trail on Wanderclue.` };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled share sheet, nothing to do
      }
    }
  }

  return (
    <div className="screen complete-screen">
      <div className="confetti">
        {Array.from({ length: 20 }).map((_, i) => (
          <i key={i} />
        ))}
      </div>
      <StatusBar light />

      <div className="complete-avatar">
        <CoupleAvatar size={64} />
      </div>
      <p className="eyebrow">Trail complete</p>
      <h2>You made it, together.</h2>
      <p className="complete-wit">
        {trail.stopCount} stops, {trail.durationMinutes} minutes, and a city you&rsquo;ll never walk past the
        same way again.
      </p>

      <div className="album-stack">
        {left && <img className="album-back left" src={left} alt="" />}
        {right && <img className="album-back right" src={right} alt="" />}
        {main && (
          <div className="album-main">
            <img src={main} alt="" />
            <span>{trail.name}</span>
          </div>
        )}
      </div>

      <div className="complete-stats">
        <div>
          <strong>{trail.stopCount}</strong>
          <span>Stops</span>
        </div>
        <div>
          <strong>{trail.durationMinutes}m</strong>
          <span>Time</span>
        </div>
        <div>
          <strong>{photos.length}</strong>
          <span>Photos</span>
        </div>
      </div>

      <button type="button" className="btn-primary light" onClick={onViewMap}>
        <CompassIcon size={18} /> View your map
      </button>
      <button type="button" className="btn-outline-light" onClick={handleShare}>
        <ShareIcon size={16} /> Share the trail
      </button>
    </div>
  );
}
