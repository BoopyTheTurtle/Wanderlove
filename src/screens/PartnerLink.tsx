import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { StatusBar } from "../components/PhoneFrame";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { CameraIcon, HeartIcon, UserIcon } from "../components/Icons";
import { PROFILES, findProfile, profileFromQr, qrPayload } from "../data/profiles";
import type { Profile } from "../data/profiles";

type Method = "qr" | "username" | "email";

export function PartnerLink({
  me,
  onLinked,
  onContinue,
  onSkip,
  onSwitchProfile,
}: {
  me: Profile;
  onLinked: (partnerId: string) => void;
  onContinue: () => void;
  onSkip: () => void;
  onSwitchProfile: () => void;
}) {
  const [method, setMethod] = useState<Method>("qr");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [partner, setPartner] = useState<Profile | null>(null);

  const testPartner = PROFILES.find((p) => p.id !== me.id)!;

  function link(found: Profile | null) {
    if (!found) {
      setError(method === "email" ? "No adventurer found with that email." : "No adventurer found with that username.");
      return;
    }
    if (found.id === me.id) {
      setError("That's you! Enter your partner's details.");
      return;
    }
    setError(null);
    setScanning(false);
    setPartner(found);
    onLinked(found.id);
  }

  function switchMethod(next: Method) {
    setMethod(next);
    setQuery("");
    setError(null);
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
      <StatusBar />

      <div className="partner-hero">
        <ProfileAvatar profile={me} size={72} />
        <span className="link-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <ProfileAvatar profile={null} size={72} />
      </div>

      <div className="partner-copy">
        <h1>Are you ready for an adventure?</h1>
        <h2 className="partner-sub">Choose your partner</h2>
      </div>

      <div className="segmented partner-tabs" role="tablist">
        {(["qr", "username", "email"] as Method[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={method === m}
            className={method === m ? "active" : ""}
            onClick={() => switchMethod(m)}
          >
            {m === "qr" ? "QR code" : m === "username" ? "Username" : "Email"}
          </button>
        ))}
      </div>

      {method === "qr" ? (
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
      ) : (
        <form
          className="card link-card"
          onSubmit={(e) => {
            e.preventDefault();
            link(findProfile(query, method));
          }}
        >
          <label className="field">
            <span>{method === "username" ? "Partner's username" : "Partner's email"}</span>
            <div className={`field-input ${error ? "invalid" : ""}`}>
              {method === "username" ? <b>@</b> : <UserIcon size={16} />}
              <input
                type={method === "email" ? "email" : "text"}
                inputMode={method === "email" ? "email" : "text"}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                placeholder={method === "username" ? "username" : "name@email.com"}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setError(null);
                }}
              />
            </div>
          </label>
          {error && <p className="field-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={!query.trim()}>
            Link partner
          </button>
          <p className="hint">
            Test partner: {method === "username" ? `@${testPartner.username}` : testPartner.email}
          </p>
        </form>
      )}

      <div className="partner-foot">
        <button type="button" className="text-button" onClick={onSkip}>
          Skip for now, just browse
        </button>
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
          <button type="button" className="btn-primary light" onClick={() => link(profileFromQr(qrPayload(testPartner)))}>
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
