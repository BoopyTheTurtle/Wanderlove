import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TermsUpdate } from "./TermsUpdate";

describe("TermsUpdate", () => {
  const html = renderToStaticMarkup(<TermsUpdate userId="u" onDone={() => {}} onSignOut={() => {}} />);

  it("links the updated notice and asks for the same tick box as onboarding", () => {
    expect(html).toContain("The tester notice has changed");
    expect(html).toContain('href="/tester-notice"');
    expect(html).toContain("I am 18 or older and have read the updated");
  });

  it("keeps Continue disabled until the box is ticked", () => {
    expect(html).toMatch(/<button type="submit" class="btn-primary" disabled="">/);
  });
});
