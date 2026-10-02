import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TesterNotice } from "./TesterNotice";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&rsquo;|’/g, "'")
    .replace(/\s+/g, " ")
    .trim();

describe("TesterNotice", () => {
  const notice = text(renderToStaticMarkup(<TesterNotice />));

  it("describes the weekly leaderboard: opt-in, what others see, and leaving", () => {
    expect(notice).toContain("Weekly leaderboard");
    expect(notice).toContain("only when both of you say yes");
    expect(notice).toContain("Either of you can leave alone");
    expect(notice).toContain("your couple name and this week's points");
    expect(notice).toContain("A couple without a name stays off the board");
  });

  it("describes tester feedback: what is stored, what never is, and deletion", () => {
    expect(notice).toContain("Version tester-v3");
    expect(notice).toContain("never the trail, place, or partner");
    expect(notice).toContain("votes stay hidden until three testers have voted");
    expect(notice).toContain("Deleting your account deletes your feedback");
  });

  it("states what happens to couple data on unlink", () => {
    expect(notice).toContain("Unlinking takes your couple off the leaderboard at once");
    expect(notice).toContain("for 90 days after the unlink, then deletes them");
  });
});
