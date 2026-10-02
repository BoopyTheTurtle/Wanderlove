import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  CoupleNameError,
  agreeCoupleName,
  clearCoupleName,
  dropSuggestion,
  loadCoupleName,
  nameErrorMessage,
  onForeground,
  suggestCoupleName,
} from "../lib/coupleStats";
import type { CoupleName } from "../lib/coupleStats";
import "./couple.css";

const MAX_NAME = 30;

export type CoupleNameState = CoupleName | null | "loading" | "failed";
export type NameAction = "suggest" | "agree" | "drop" | "remove";

// The couple name in Settings. A name needs both partners' yes, and either removes it alone (abuse-threat-model.md,
// G4). Loads on mount and on returning to the foreground, so a partner's suggestion shows up without a reload.
export function CoupleNameSection({ partnerName }: { partnerName: string }) {
  const [state, setState] = useState<CoupleNameState>("loading");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<NameAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setState(await loadCoupleName());
    } catch (e) {
      console.error("Couldn't load the couple name", e);
      setState((s) => (s === "loading" ? "failed" : s));
    }
  }, []);

  useEffect(() => {
    void reload();
    return onForeground(() => void reload());
  }, [reload]);

  async function run(action: NameAction, work: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await work();
      setEditing(false);
      setDraft("");
    } catch (e) {
      if (!(e instanceof CoupleNameError)) console.error(`Couple name: ${action} failed`, e);
      setError(nameErrorMessage(e));
    }
    // Every outcome reloads: a refusal such as no_proposal means the screen was out of date.
    await reload();
    setBusy(null);
  }

  const current = typeof state === "object" ? state : null;

  return (
    <CoupleNameView
      partnerName={partnerName}
      state={state}
      draft={draft}
      editing={editing}
      busy={busy}
      error={error}
      onDraft={setDraft}
      onSuggest={() => void run("suggest", () => suggestCoupleName(draft))}
      onAgree={() => current?.proposal && void run("agree", () => agreeCoupleName(current.proposal!))}
      onDrop={() => current && void run("drop", () => dropSuggestion(current))}
      onRemove={() => void run("remove", clearCoupleName)}
      onEdit={(on) => {
        setEditing(on);
        setDraft("");
        setError(null);
      }}
      onRetry={() => {
        setState("loading");
        void reload();
      }}
    />
  );
}

export function CoupleNameView({
  partnerName,
  state,
  draft,
  editing,
  busy,
  error,
  onDraft,
  onSuggest,
  onAgree,
  onDrop,
  onRemove,
  onEdit,
  onRetry,
}: {
  partnerName: string;
  state: CoupleNameState;
  draft: string;
  // True while a named couple writes a new suggestion.
  editing: boolean;
  busy: NameAction | null;
  error: string | null;
  onDraft: (draft: string) => void;
  onSuggest: () => void;
  onAgree: () => void;
  // Withdraws my suggestion or turns down the partner's, keeping any current name.
  onDrop: () => void;
  onRemove: () => void;
  onEdit: (editing: boolean) => void;
  onRetry: () => void;
}) {
  // Not linked: nothing to name.
  if (state === null) return null;

  const errorLine = error && (
    <p className="field-error couple-name-error" role="alert">
      {error}
    </p>
  );

  function body() {
    if (state === "loading") return <p className="settings-note">Loading…</p>;
    if (state === "failed") {
      return (
        <>
          <p className="settings-note">Couldn&rsquo;t load your couple name.</p>
          <button type="button" className="settings-outline" onClick={onRetry}>
            Try again
          </button>
        </>
      );
    }
    const { name, proposal, proposedByMe } = state as CoupleName;
    const nameLine = name && <p className="couple-name-current">{name}</p>;

    if (proposal && proposedByMe) {
      return (
        <>
          {nameLine}
          <p className="couple-name-waiting">
            Waiting for {partnerName} to agree to &lsquo;{proposal}&rsquo;
          </p>
          {errorLine}
          <button type="button" className="settings-outline" disabled={busy !== null} onClick={onDrop}>
            {busy === "drop" ? "Withdrawing…" : "Withdraw"}
          </button>
        </>
      );
    }

    if (proposal) {
      return (
        <>
          {nameLine}
          <p className="couple-name-proposal">
            &lsquo;{proposal}&rsquo; <span>&mdash; {partnerName} suggested this</span>
          </p>
          {name && <p className="settings-note">You stay &lsquo;{name}&rsquo; unless you agree.</p>}
          {errorLine}
          <div className="couple-name-actions">
            <button type="button" className="btn-primary" disabled={busy !== null} onClick={onAgree}>
              {busy === "agree" ? "Agreeing…" : "Agree"}
            </button>
            <button type="button" className="settings-outline" disabled={busy !== null} onClick={onDrop}>
              {busy === "drop" ? "Saying no…" : "Not this"}
            </button>
          </div>
        </>
      );
    }

    if (name && !editing) {
      return (
        <>
          {nameLine}
          {errorLine}
          <div className="couple-name-actions">
            <button type="button" className="settings-outline" disabled={busy !== null} onClick={() => onEdit(true)}>
              Change
            </button>
            <button type="button" className="settings-outline" disabled={busy !== null} onClick={onRemove}>
              {busy === "remove" ? "Removing…" : "Remove"}
            </button>
          </div>
          <p className="settings-note">Either of you can remove it, without asking the other.</p>
        </>
      );
    }

    function submit(event: FormEvent) {
      event.preventDefault();
      if (draft.trim() && busy === null) onSuggest();
    }

    return (
      <form className="couple-name-form" onSubmit={submit} noValidate>
        {nameLine}
        <label className="field">
          <span>{name ? "New name" : "A name for you two"}</span>
          <span className={error ? "field-input invalid" : "field-input"}>
            <input
              type="text"
              maxLength={MAX_NAME}
              placeholder="Like Wild Wanderers"
              autoComplete="off"
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
            />
          </span>
        </label>
        {errorLine}
        <p className="settings-note">
          {partnerName} has to agree before it becomes your name. It may later show to other couples on the leaderboard,
          so avoid full names or places.
        </p>
        <button type="submit" className="btn-primary" disabled={!draft.trim() || busy !== null}>
          {busy === "suggest" ? "Suggesting…" : "Suggest"}
        </button>
        {editing && (
          <button type="button" className="text-button" disabled={busy !== null} onClick={() => onEdit(false)}>
            Cancel
          </button>
        )}
      </form>
    );
  }

  return (
    <section className="card settings-card couple-name" aria-labelledby="settings-couple-name-title">
      <p className="card-kicker" id="settings-couple-name-title">
        Couple name
      </p>
      {body()}
    </section>
  );
}
