import { useEffect, useState } from "react";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { pairEmoji } from "../lib/keyEmoji";
import type { KeyEmoji } from "../lib/keyEmoji";
import "../keys.css";

// The partner's key changed, or is new to this phone while trails are shared. Trusting it re-shares those trails'
// keys with it; nothing is wrapped for the key until then. The emoji let the user compare with the partner's phone.
export function PartnerKeyConfirm({
  partnerName,
  reason,
  myKeyId,
  partnerKeyId,
  onTrust,
  onNotNow,
}: {
  partnerName: string;
  reason: "changed" | "new";
  myKeyId: string;
  // The partner's new key ID.
  partnerKeyId: string;
  onTrust: () => Promise<void>;
  onNotNow: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function handleTrust() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await onTrust();
    } catch (e) {
      console.error("Couldn't share the trails", e);
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="screen auth-screen keys-screen">
      <StatusBar />
      <div className="onboarding-head">
        <p className="wordmark">
          <BrandMark /> Wannadoo
        </p>
        <h1>
          {reason === "changed" ? `${partnerName}’s keys changed` : `Confirm ${partnerName}’s keys on this phone`}
        </h1>
        <p className="intro">
          {reason === "changed"
            ? `Most likely ${partnerName} signed in on a new phone or made a new recovery code. Trust the new keys?`
            : `This phone hasn’t seen ${partnerName}’s keys before. Trust them?`}
        </p>
      </div>

      <div className="card auth-card">
        <p className="key-check-lead">
          Compare with {partnerName}&rsquo;s phone before trusting. Their Profile should show these four:
        </p>
        <PairEmoji a={myKeyId} b={partnerKeyId} />
        <p className="keys-note">
          Trusting them shares the trails you walked together, so {partnerName} can see their photos. If the emoji
          differ, or you don&rsquo;t expect this, ask {partnerName} first.
        </p>
        {error && (
          <p className="field-error" role="alert">
            Couldn&rsquo;t share your trails. Check your connection and try again.
          </p>
        )}
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void handleTrust()}>
          {busy ? "Sharing…" : "Trust them"}
        </button>
        <button type="button" className="btn-soft" disabled={busy} onClick={onNotNow}>
          Not now
        </button>
      </div>
    </div>
  );
}

// The partner's published key differs from the key ID their invite carried, and the accept screen could not unlink
// straight away (offline, or the app closed). Unlinks on OK.
export function PartnerKeyMismatch({ partnerName, onUnlink }: { partnerName: string; onUnlink: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function handleUnlink() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await onUnlink();
    } catch (e) {
      console.error("Couldn't unlink", e);
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="screen auth-screen keys-screen">
      <StatusBar />
      <div className="onboarding-head">
        <p className="wordmark">
          <BrandMark /> Wannadoo
        </p>
        <h1>This invite doesn&rsquo;t match {partnerName}&rsquo;s keys</h1>
        <p className="intro">Ask them to show a new code. You&rsquo;ll be unlinked until then.</p>
      </div>
      <div className="card auth-card">
        {error && (
          <p className="field-error" role="alert">
            Couldn&rsquo;t unlink. Check your connection and try again.
          </p>
        )}
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void handleUnlink()}>
          {busy ? "Unlinking…" : "OK"}
        </button>
      </div>
    </div>
  );
}

// Four emoji made from two key IDs; both partners' phones show the same four when each holds the other's real key.
export function PairEmoji({ a, b }: { a: string; b: string }) {
  const [emoji, setEmoji] = useState<{ pair: string; list: KeyEmoji[] } | null>(null);
  const pair = `${a}:${b}`;

  useEffect(() => {
    let active = true;
    pairEmoji(a, b).then(
      (list) => active && setEmoji({ pair: `${a}:${b}`, list }),
      (e: unknown) => console.error("Couldn't make the key emoji", e),
    );
    return () => {
      active = false;
    };
  }, [a, b]);

  const list = emoji?.pair === pair ? emoji.list : null;
  return (
    <p className="key-emoji" role="img" aria-label={list ? list.map((e) => e.name).join(", ") : "Loading"}>
      {list ? list.map((e, i) => <span key={i}>{e.char}</span>) : <span className="key-emoji-wait">· · · ·</span>}
    </p>
  );
}
