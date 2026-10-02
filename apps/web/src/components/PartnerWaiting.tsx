import type { Profile } from "@wannadoo/core";
import { ProfileAvatar } from "./ProfileAvatar";
import "../settings.css";

// After a Together start: waits for the partner to join, and moves on by itself once they do. A declined invitation
// looks the same as one still waiting, so this never tells the starter "no" (abuse threat model, section 6).
export function PartnerWaiting({
  partner,
  partnerName,
  onStartAlone,
}: {
  partner?: Profile;
  partnerName: string;
  onStartAlone: () => void;
}) {
  return (
    <div className="settings-backdrop">
      <div className="settings-dialog partner-waiting" role="dialog" aria-modal="true" aria-labelledby="waiting-title">
        {partner && (
          <div className="partner-waiting-avatar">
            <ProfileAvatar profile={partner} size={64} />
          </div>
        )}
        <div className="link-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <h2 id="waiting-title">Waiting for {partnerName} to join…</h2>
        <p>The quest opens as soon as {partnerName} taps Join on their phone.</p>
        <div className="settings-dialog-actions">
          <button type="button" className="settings-cancel" onClick={onStartAlone}>
            Start without {partnerName}
          </button>
        </div>
      </div>
    </div>
  );
}
