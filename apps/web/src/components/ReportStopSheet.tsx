import { useState } from "react";
import { REPORT_NOTE_MAX, reportFailure } from "../lib/stopReports";
import type { ReportFailure, ReportReason } from "../lib/stopReports";
import "../report-stop.css";

const REASONS: { id: ReportReason; label: string; examples: string }[] = [
  { id: "unsafe", label: "Unsafe", examples: "Traffic, construction, private land, water" },
  { id: "unpleasant", label: "Unpleasant", examples: "Smelly, rubbish, not really a place" },
];

const FAILURE_LINE: Record<ReportFailure, string> = {
  tooMany: "You’ve sent a lot of reports today. Try again tomorrow.",
  offline: "You seem to be offline, so the report didn’t send. Try again when you have a connection.",
  other: "Couldn’t send the report. Try again in a moment.",
};

export const REPORT_PRIVACY_LINE =
  "This sends the stop’s location to Wannadoo so we can review it. Your start and route stay private.";
export const REPORT_THANKS_LINE = "Thanks. New routes will skip this spot.";

export type ReportSheetState =
  { status: "editing"; failure?: ReportFailure } | { status: "sending" } | { status: "sent" };

// The low-key link under a stop's task, and the sheet it opens. Once sent, the link turns into the thank-you line.
export function ReportStop({
  stopName,
  onReport,
}: {
  stopName: string;
  onReport: (reason: ReportReason, note: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <>
      {sent ? (
        <p className="report-stop-done">{REPORT_THANKS_LINE}</p>
      ) : (
        <button type="button" className="report-stop-link" onClick={() => setOpen(true)}>
          Report this stop
        </button>
      )}
      {open && (
        <ReportStopSheet
          stopName={stopName}
          onSend={onReport}
          onSent={() => setSent(true)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// Reports one stop as unsafe or unpleasant. The walk goes on as before whatever happens here.
export function ReportStopSheet({
  stopName,
  onSend,
  onClose,
  onSent,
}: {
  stopName: string;
  onSend: (reason: ReportReason, note: string) => Promise<void>;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [state, setState] = useState<ReportSheetState>({ status: "editing" });
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");

  async function send() {
    if (!reason) return;
    setState({ status: "sending" });
    try {
      await onSend(reason, note);
      setState({ status: "sent" });
      onSent?.();
    } catch (e) {
      console.error("Couldn't send the report", e);
      setState({ status: "editing", failure: reportFailure(e) });
    }
  }

  return (
    <ReportStopSheetView
      stopName={stopName}
      state={state}
      reason={reason}
      note={note}
      onReason={setReason}
      onNote={(value) => setNote(value.slice(0, REPORT_NOTE_MAX))}
      onSend={() => void send()}
      onClose={onClose}
    />
  );
}

// The sheet's markup for a given state; ReportStopSheet holds the state.
export function ReportStopSheetView({
  stopName,
  state,
  reason,
  note,
  onReason,
  onNote,
  onSend,
  onClose,
}: {
  stopName: string;
  state: ReportSheetState;
  reason: ReportReason | null;
  note: string;
  onReason: (reason: ReportReason) => void;
  onNote: (note: string) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  if (state.status === "sent") {
    return (
      <div className="report-backdrop">
        <div className="report-sheet" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <h2 id="report-title">Report sent</h2>
          <p className="report-sent" role="status">
            {REPORT_THANKS_LINE}
          </p>
          <div className="report-actions">
            <button type="button" className="btn-primary" onClick={onClose}>
              Back to the stop
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sending = state.status === "sending";
  const failure = state.status === "editing" ? state.failure : undefined;
  return (
    <div className="report-backdrop">
      <div className="report-sheet" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <h2 id="report-title">Report this stop</h2>
        <p className="report-place">{stopName}</p>

        <fieldset className="report-reasons" disabled={sending}>
          <legend>What&rsquo;s wrong with it?</legend>
          {REASONS.map((r) => (
            <label key={r.id} className={reason === r.id ? "report-reason selected" : "report-reason"}>
              <input
                type="radio"
                name="report-reason"
                value={r.id}
                checked={reason === r.id}
                onChange={() => onReason(r.id)}
              />
              <span>
                <b>{r.label}</b>
                <small>{r.examples}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="report-note">
          <span>Note (optional)</span>
          <textarea
            value={note}
            maxLength={REPORT_NOTE_MAX}
            rows={3}
            disabled={sending}
            onChange={(e) => onNote(e.target.value)}
          />
        </label>
        <p className="report-count" aria-live="polite">
          {note.length} / {REPORT_NOTE_MAX}
        </p>

        <p className="report-privacy">{REPORT_PRIVACY_LINE}</p>
        {failure && (
          <p className="field-error report-error" role="alert">
            {FAILURE_LINE[failure]}
          </p>
        )}

        <div className="report-actions">
          <button type="button" className="btn-primary" disabled={!reason || sending} onClick={onSend}>
            {sending ? "Sending…" : "Send"}
          </button>
          <button type="button" className="report-cancel" disabled={sending} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
