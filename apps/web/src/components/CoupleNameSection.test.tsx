import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CoupleNameView } from "./CoupleNameSection";
import type { CoupleNameState } from "./CoupleNameSection";

vi.mock("../lib/supabase", () => ({ supabase: {} }));

const noop = () => {};

function render(state: CoupleNameState, extra: Partial<Parameters<typeof CoupleNameView>[0]> = {}) {
  const html = renderToStaticMarkup(
    <CoupleNameView
      partnerName="Emma"
      state={state}
      draft=""
      editing={false}
      busy={null}
      error={null}
      onDraft={noop}
      onSuggest={noop}
      onAgree={noop}
      onDrop={noop}
      onRemove={noop}
      onEdit={noop}
      onRetry={noop}
      {...extra}
    />,
  );
  const buttons = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { html, buttons, text };
}

describe("CoupleNameView", () => {
  it("shows nothing when not linked", () => {
    expect(render(null).html).toBe("");
  });

  it("offers a field and Suggest when there is no name", () => {
    const { html, buttons, text } = render({ name: null, proposal: null, proposedByMe: false });
    expect(html).toContain("<input");
    expect(buttons).toEqual(["Suggest"]);
    expect(text).toContain("Emma has to agree");
    expect(text).toContain("avoid full names or places");
  });

  it("disables Suggest until something is typed", () => {
    expect(render({ name: null, proposal: null, proposedByMe: false }).html).toMatch(
      /<button type="submit"[^>]*disabled/,
    );
    expect(render({ name: null, proposal: null, proposedByMe: false }, { draft: "Us" }).html).not.toMatch(
      /<button type="submit"[^>]*disabled/,
    );
  });

  it("waits for the partner on my suggestion", () => {
    const { buttons, text, html } = render({ name: null, proposal: "Wild Pair", proposedByMe: true });
    expect(text).toContain("Waiting for Emma to agree to ‘Wild Pair’");
    expect(buttons).toEqual(["Withdraw"]);
    expect(html).not.toContain("<input");
  });

  it("asks me about the partner's suggestion", () => {
    const { buttons, text } = render({ name: null, proposal: "Wild Pair", proposedByMe: false });
    expect(text).toContain("‘Wild Pair’ — Emma suggested this");
    expect(buttons).toEqual(["Agree", "Not this"]);
  });

  it("keeps the current name in view while a new one is suggested", () => {
    const { text } = render({ name: "Old Pair", proposal: "New Pair", proposedByMe: false });
    expect(text).toContain("Old Pair");
    expect(text).toContain("You stay ‘Old Pair’ unless you agree.");
  });

  it("shows the name with Change and Remove", () => {
    const { buttons, text, html } = render({ name: "Wild Pair", proposal: null, proposedByMe: false });
    expect(text).toContain("Wild Pair");
    expect(buttons).toEqual(["Change", "Remove"]);
    expect(html).not.toContain("<input");
  });

  it("offers a field and Cancel while changing the name", () => {
    const { buttons, html } = render({ name: "Wild Pair", proposal: null, proposedByMe: false }, { editing: true });
    expect(html).toContain("<input");
    expect(buttons).toEqual(["Suggest", "Cancel"]);
  });

  it("shows the error and marks the field", () => {
    const { html, text } = render(
      { name: null, proposal: null, proposedByMe: false },
      { error: "That name isn’t allowed. Try another." },
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("field-input invalid");
    expect(text).toContain("That name isn’t allowed. Try another.");
  });

  it("names the action under way", () => {
    expect(render({ name: null, proposal: "X", proposedByMe: false }, { busy: "agree" }).buttons).toEqual([
      "Agreeing…",
      "Not this",
    ]);
  });

  it("offers a retry when loading failed", () => {
    expect(render("failed").buttons).toEqual(["Try again"]);
    expect(render("loading").text).toContain("Loading…");
  });
});
