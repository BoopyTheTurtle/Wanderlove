import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { REPORT_PRIVACY_LINE, REPORT_THANKS_LINE, ReportStop, ReportStopSheetView } from "./ReportStopSheet";
import type { ReportSheetState } from "./ReportStopSheet";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

const noop = () => {};

function render(state: ReportSheetState, reason: "unsafe" | "unpleasant" | null = null, note = "") {
  return renderToStaticMarkup(
    <ReportStopSheetView
      stopName="Old bench"
      state={state}
      reason={reason}
      note={note}
      onReason={noop}
      onNote={noop}
      onSend={noop}
      onClose={noop}
    />,
  );
}

// The markup escapes apostrophes; compare against the plain text.
const text = (html: string) => html.replace(/&#x27;|&#39;/g, "'");

describe("ReportStopSheetView", () => {
  it("offers both reasons, the note with its count, and the privacy line", () => {
    const html = text(render({ status: "editing" }, null, "Broken glass"));
    expect(html).toContain("Unsafe");
    expect(html).toContain("Traffic, construction, private land, water");
    expect(html).toContain("Unpleasant");
    expect(html).toContain("Smelly, rubbish, not really a place");
    expect(html).toContain('maxLength="280"');
    expect(html).toContain("12 / 280");
    expect(html).toContain(REPORT_PRIVACY_LINE);
    expect(html).toContain("Cancel");
  });

  it("keeps Send off until a reason is chosen", () => {
    expect(render({ status: "editing" })).toMatch(/<button type="button" class="btn-primary" disabled="">Send/);
    expect(render({ status: "editing" }, "unsafe")).toMatch(/<button type="button" class="btn-primary">Send/);
  });

  it("locks the sheet while sending", () => {
    const html = render({ status: "sending" }, "unsafe");
    expect(html).toContain("Sending…");
    expect(html).toMatch(/<fieldset class="report-reasons" disabled="">/);
  });

  it("thanks the user once sent", () => {
    const html = render({ status: "sent" }, "unsafe");
    expect(html).toContain(REPORT_THANKS_LINE);
    expect(html).not.toContain("Send<");
  });

  it("says plainly why a report failed", () => {
    expect(text(render({ status: "editing", failure: "tooMany" }, "unsafe"))).toContain(
      "You’ve sent a lot of reports today. Try again tomorrow.",
    );
    expect(render({ status: "editing", failure: "offline" }, "unsafe")).toContain("the report didn’t send");
    expect(render({ status: "editing", failure: "other" }, "unsafe")).toContain("Couldn’t send the report");
  });
});

describe("ReportStop", () => {
  it("shows only the link until opened", () => {
    const html = renderToStaticMarkup(<ReportStop stopName="Old bench" onReport={() => Promise.resolve()} />);
    expect(html).toContain("Report this stop");
    expect(html).not.toContain("report-sheet");
  });
});
