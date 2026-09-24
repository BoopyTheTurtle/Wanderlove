import { useState } from "react";
import type { Profile } from "@wannadoo/core";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { HeartIcon } from "../components/Icons";

const MAX_WORD = 15;
const EMPTY = ["", "", ""];

type Stage = "mine" | "theirs" | "done";

// Clue 2: each partner writes three one-word compliments about the other, passing the phone
// between turns, then both avatars appear wrapped in the words written about them.
export function ComplimentExchange({
  me,
  partner,
  onDone,
}: {
  me: Profile | null;
  partner: Profile | null;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<Stage>("mine");
  const [aboutPartner, setAboutPartner] = useState(EMPTY);
  const [aboutMe, setAboutMe] = useState(EMPTY);

  const myName = me?.name ?? "You";
  const partnerName = partner?.name ?? "your partner";

  if (stage === "done") {
    return (
      <div className="sh-duo" aria-label="Your compliments">
        <DuoPerson profile={partner} name={partnerName} words={aboutPartner} />
        <span className="sh-duo-heart" aria-hidden="true">
          <HeartIcon size={16} />
        </span>
        <DuoPerson profile={me} name={myName} words={aboutMe} />
      </div>
    );
  }

  const mine = stage === "mine";
  return (
    <WordForm
      key={stage}
      title={mine ? `${myName}, name three qualities you love in ${partnerName}` : `Pass the phone to ${partnerName}`}
      subtitle={mine ? "One word each." : `${partnerName}, write three compliments for ${myName}. One word each.`}
      placeholders={mine ? ["Kind", "Funny", "Brave"] : ["Caring", "Clever", "Gorgeous"]}
      words={mine ? aboutPartner : aboutMe}
      onChange={mine ? setAboutPartner : setAboutMe}
      onSubmit={() => {
        if (mine) {
          setStage("theirs");
        } else {
          setStage("done");
          onDone();
        }
      }}
    />
  );
}

function WordForm({
  title,
  subtitle,
  placeholders,
  words,
  onChange,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  placeholders: string[];
  words: string[];
  onChange: (words: string[]) => void;
  onSubmit: () => void;
}) {
  const ready = words.every((w) => w.length > 0);
  return (
    <form
      className="sh-words"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit();
      }}
    >
      <p className="sh-words-title">{title}</p>
      <p className="sh-words-sub">{subtitle}</p>
      {words.map((word, i) => (
        <input
          key={i}
          type="text"
          value={word}
          maxLength={MAX_WORD}
          placeholder={placeholders[i]}
          autoComplete="off"
          autoCapitalize="words"
          aria-label={`Word ${i + 1}`}
          onChange={(e) => {
            const next = [...words];
            next[i] = e.target.value.replace(/\s/g, "").slice(0, MAX_WORD);
            onChange(next);
          }}
        />
      ))}
      <button type="submit" className="sh-words-submit" disabled={!ready}>
        Submit
      </button>
    </form>
  );
}

function DuoPerson({ profile, name, words }: { profile: Profile | null; name: string; words: string[] }) {
  return (
    <figure className="sh-duo-person">
      {words.map((word, i) => (
        <span key={i} className={`sh-bubble sh-bubble--${i}`} style={{ animationDelay: `${0.15 + i * 0.15}s` }}>
          {word}
        </span>
      ))}
      <ProfileAvatar profile={profile} size={64} />
      <figcaption>{name}</figcaption>
    </figure>
  );
}
