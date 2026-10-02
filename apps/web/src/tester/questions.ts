// The open questions that prompt a quest comment (docs/tester-feedback.md, section 2.4). Each asks about the
// experience, not the relationship.

const TOGETHER = [
  "Which moment of this quest would you want to repeat?",
  "Was there a task you’d swap out? What would you put in its place?",
  "When did you forget you were using an app?",
  "Did the route feel right for the two of you? What would have made it better?",
  "Which task surprised you, and how?",
  "Was anything awkward, confusing, or too long?",
  "What would make you want to walk another quest this week?",
  "If you could change one stop, which would it be and why?",
  "How did the pace feel: rushed, relaxed, or somewhere in between?",
  "What did you talk about between stops that the app didn’t ask about?",
  "Was there a moment you nearly gave up? What kept you going?",
  "What would you tell the person who wrote these tasks?",
];

// Solo says "you" in question 4 and drops question 10, which assumes a partner.
const SOLO = TOGETHER.map((q, i) =>
  i === 3 ? "Did the route feel right for you? What would have made it better?" : q,
).filter((_, i) => i !== 9);

export type QuestMode = "together" | "solo";

export function questionsFor(mode: QuestMode): readonly string[] {
  return mode === "solo" ? SOLO : TOGETHER;
}

// A random question for the mode, never the one already shown.
export function pickQuestion(mode: QuestMode, current?: string, random: () => number = Math.random): string {
  const all = questionsFor(mode);
  const pool = all.filter((q) => q !== current);
  return pool[Math.floor(random() * pool.length)] ?? all[0];
}
