import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { StatusBar } from "../components/PhoneFrame";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { CameraIcon, HeartIcon } from "../components/Icons";
import { PROFILES, profileFromQr, qrPayload } from "@wannadoo/core";
import type { Profile } from "@wannadoo/core";

export function PartnerLink({
  me,
  onLinked,
  onContinue,
  onSwitchProfile,
}: {
  me: Profile;
  onLinked: (partnerId: string) => void;
  onContinue: () => void;
  onSwitchProfile: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [partner, setPartner] = useState<Profile | null>(null);

  const testPartner = PROFILES.find((p) => p.id !== me.id)!;

  function link(found: Profile | null) {
    if (!found || found.id === me.id) return;
    setScanning(false);
    setPartner(found);
    onLinked(found.id);
  }

  if (partner) {
    return (
      <div className="screen light-screen partner-screen">
        <StatusBar />
        <div className="partner-hero linked">
          <ProfileAvatar profile={me} size={84} />
          <span className="link-heart">
            <HeartIcon size={20} filled />
          </span>
          <ProfileAvatar profile={partner} size={84} />
        </div>
        <div className="partner-copy">
          <p className="eyebrow">Linked</p>
          <h1>You&rsquo;re exploring with {partner.name}</h1>
          <p>Your trails, tasks and photos are now shared between you.</p>
        </div>
        <div className="partner-actions">
          <button type="button" className="btn-primary" onClick={onContinue}>
            Let&rsquo;s go
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen light-screen partner-screen">
      <div className="adventure-top">
        <img className="adventure-bg" src="/adventure-bg.jpg" alt="" />
        <StatusBar light />

        <div className="partner-copy">
          <h1>Are you ready for an adventure?</h1>
          <h2 className="partner-sub">Choose your partner</h2>
        </div>

        <div className="partner-hero">
          <ProfileAvatar profile={me} size={64} />
          <span className="link-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <ProfileAvatar profile={null} size={64} />
        </div>
      </div>

      <section className="card link-card qr-card">
        <div className="qr-frame">
          <QRCodeSVG value={qrPayload(me)} size={148} fgColor="#1b3431" bgColor="transparent" level="M" />
        </div>
        <p className="qr-caption">
          Have your partner scan this, or scan theirs.
          <b>@{me.username}</b>
        </p>
        <button type="button" className="btn-primary" onClick={() => setScanning(true)}>
          <CameraIcon size={18} /> Scan partner&rsquo;s code
        </button>
      </section>

      <div className="partner-foot">
        <button type="button" className="dev-switch" onClick={onSwitchProfile}>
          Test mode: you&rsquo;re {me.name} · reset
        </button>
      </div>

      {scanning && (
        <div className="scanner" role="dialog" aria-label="Scan partner's QR code">
          <p>Point your camera at your partner&rsquo;s code</p>
          <div className="scanner-window">
            <span className="scan-line" />
            <i />
            <i />
            <i />
            <i />
          </div>
          <button
            type="button"
            className="btn-primary light"
            onClick={() => link(profileFromQr(qrPayload(testPartner)))}
          >
            Simulate scan ({testPartner.name})
          </button>
          <button type="button" className="btn-outline-light" onClick={() => setScanning(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
