import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_REVIEW, reviewHasText } from "./feedbackState";
import { AppReviewCard } from "./AppReviewCard";

const noop = () => Promise.resolve();
const text = (html: string) => html.replace(/&#x27;|’/g, "'");

describe("AppReviewCard", () => {
  it("shows the three fields with their prompts and the email line", () => {
    const html = text(renderToStaticMarkup(<AppReviewCard onSend={noop} />));
    expect(html).toContain("Tell us what you think");
    expect(html).toContain("What would you tell a friend about Wannadoo?");
    expect(html).toContain("Which part would you miss if we took it away?");
    expect(html).toContain("If you could add one thing, what would it be?");
    expect(html).toContain("What you'd like to see");
    expect(html.match(/maxLength="1000"/g)).toHaveLength(3);
    expect(html).toContain('href="mailto:support@wannadoo.app"');
  });

  it("keeps Send disabled while every field is empty", () => {
    const html = renderToStaticMarkup(<AppReviewCard onSend={noop} />);
    expect(html).toMatch(/<button type="button" class="btn-primary tester-send" disabled="">Send/);
  });

  it("counts any field with text, and only text", () => {
    expect(reviewHasText(EMPTY_REVIEW)).toBe(false);
    expect(reviewHasText({ ...EMPTY_REVIEW, likes: "   " })).toBe(false);
    expect(reviewHasText({ ...EMPTY_REVIEW, wishes: "Dark mode" })).toBe(true);
  });
});
