import { useId, useState } from "react";
import type { ReactNode } from "react";
import { avatarCatalog, randomAppearance } from "@wannadoo/core";
import type { AccessoryId, Appearance, ColourOption, ScaleOption } from "@wannadoo/core";
import { StatusBar } from "../components/PhoneFrame";
import { Avatar } from "../components/avatar";
import { BackIcon, SparkIcon } from "../components/Icons";
import "../avatar-creator.css";

const PREVIEW_SIZE = 148;
const THUMB_SIZE = 56;

// Makes or edits an avatar (mvp-roadmap.md, stage 5): a live preview on top, the parts in plain groups below, and
// Randomise and Save at the foot. Profile opens it with Back; onboarding opens it with Skip, which leaves a random
// avatar. The record holds no gender, so the face scale names features, not people.
export function AvatarCreator({
  initial,
  title,
  intro,
  onSave,
  onBack,
  onSkip,
}: {
  initial: Appearance;
  title: string;
  intro?: string;
  // Saves the avatar; may reject, and the screen then says so and keeps the choices.
  onSave: (appearance: Appearance) => Promise<void>;
  // Profile: leaves without saving, after asking when something changed.
  onBack?: () => void;
  // Onboarding: moves on with a random avatar; may reject.
  onSkip?: () => Promise<void>;
}) {
  const [appearance, setAppearance] = useState(initial);
  const [busy, setBusy] = useState<"save" | "skip" | null>(null);
  const [failed, setFailed] = useState(false);
  const changed = JSON.stringify(appearance) !== JSON.stringify(initial);
  const c = avatarCatalog;

  function set<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    setAppearance((a) => ({ ...a, [key]: value }));
  }

  function toggleAccessory(id: AccessoryId, on: boolean) {
    setAppearance((a) => {
      const wanted = new Set(a.accessories);
      if (on) wanted.add(id);
      else wanted.delete(id);
      return { ...a, accessories: c.accessories.filter((x) => wanted.has(x.id)).map((x) => x.id) };
    });
  }

  async function act(which: "save" | "skip") {
    setBusy(which);
    setFailed(false);
    try {
      await (which === "save" ? onSave(appearance) : onSkip?.());
    } catch (e) {
      console.error("Couldn't save the avatar", e);
      setFailed(true);
      setBusy(null);
    }
  }

  function handleBack() {
    if (changed && !window.confirm("Leave without saving your avatar?")) return;
    onBack?.();
  }

  // Thumbnails leave accessories off, so a beanie or scarf never hides the hair or top they show.
  const bare = { ...appearance, accessories: [] };

  return (
    <div className="screen avatar-creator">
      <StatusBar />
      <header className="avatar-creator-head">
        {onBack && (
          <button type="button" className="icon-button" onClick={handleBack} aria-label="Back to Profile">
            <BackIcon />
          </button>
        )}
        <div className="avatar-creator-title">
          <h1>{title}</h1>
          {intro && <p>{intro}</p>}
        </div>
        {onSkip && (
          <button
            type="button"
            className="text-button avatar-creator-skip"
            disabled={busy !== null}
            onClick={() => void act("skip")}
          >
            {busy === "skip" ? "Skipping…" : "Skip"}
          </button>
        )}
      </header>

      <div className="avatar-creator-preview" aria-live="polite">
        <span className="avatar-creator-portrait">
          <Avatar appearance={appearance} size={PREVIEW_SIZE} label="Your avatar" />
        </span>
      </div>

      <div className="avatar-creator-controls">
        <Section title="Face">
          <Scale
            legend="Features"
            options={c.face}
            ends={["More angular", "Softer"]}
            value={appearance.face}
            onChange={(v) => set("face", v)}
          />
          <Scale
            legend="Age"
            options={c.age}
            ends={["Younger", "Older"]}
            value={appearance.age}
            onChange={(v) => set("age", v)}
          />
          <Swatches legend="Skin" options={c.skin} value={appearance.skin} onChange={(v) => set("skin", v)} />
          <Swatches legend="Eyes" options={c.eyes} value={appearance.eyes} onChange={(v) => set("eyes", v)} />
        </Section>

        <Section title="Hair">
          <Thumbs
            legend="Hair style"
            options={c.hair}
            value={appearance.hair}
            look={(hair) => ({ ...bare, hair })}
            onChange={(v) => set("hair", v)}
          />
          <Swatches
            legend="Hair colour"
            options={c.hairColour}
            value={appearance.hairColour}
            onChange={(v) => set("hairColour", v)}
          />
          <Thumbs
            legend="Facial hair"
            options={c.facialHair}
            value={appearance.facialHair}
            look={(facialHair) => ({ ...bare, facialHair })}
            onChange={(v) => set("facialHair", v)}
          />
        </Section>

        <Section title="Clothes">
          <Thumbs
            legend="Top"
            options={c.top}
            value={appearance.top}
            look={(top) => ({ ...bare, top })}
            onChange={(v) => set("top", v)}
          />
          <Swatches
            legend="Top colour"
            options={c.topColour}
            value={appearance.topColour}
            onChange={(v) => set("topColour", v)}
          />
        </Section>

        <Section title="Extras">
          <fieldset className="avatar-field">
            <legend>Accessories</legend>
            <div className="avatar-toggles">
              {c.accessories.map((option) => (
                <label key={option.id} className="avatar-toggle">
                  <input
                    type="checkbox"
                    checked={appearance.accessories.includes(option.id)}
                    onChange={(e) => toggleAccessory(option.id, e.target.checked)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Swatches
            legend="Background"
            options={c.background}
            value={appearance.background}
            onChange={(v) => set("background", v)}
          />
        </Section>
      </div>

      <footer className="avatar-creator-foot">
        {failed && (
          <p className="field-error avatar-creator-error" role="alert">
            Couldn&rsquo;t save your avatar. Check your connection and try again.
          </p>
        )}
        <button
          type="button"
          className="avatar-randomise"
          disabled={busy !== null}
          onClick={() => setAppearance(randomAppearance())}
        >
          <SparkIcon size={18} /> Randomise
        </button>
        <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void act("save")}>
          {busy === "save" ? "Saving…" : "Save"}
        </button>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="card avatar-section" aria-labelledby={id}>
      <h2 className="card-kicker" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}

// A three-step scale as a slider, with its ends named and each step read out by name.
function Scale({
  legend,
  options,
  ends,
  value,
  onChange,
}: {
  legend: string;
  options: ScaleOption[];
  ends: [string, string];
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="avatar-field avatar-scale">
      <span className="avatar-field-label">
        {legend} <b>{options[value]?.label}</b>
      </span>
      <input
        type="range"
        min={0}
        max={options.length - 1}
        step={1}
        value={value}
        aria-valuetext={options[value]?.label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="avatar-scale-ends" aria-hidden="true">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </span>
    </label>
  );
}

function Swatches({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: ColourOption[];
  value: number;
  onChange: (value: number) => void;
}) {
  const name = useId();
  return (
    <fieldset className="avatar-field">
      <legend>
        {legend} <b>{options[value]?.label}</b>
      </legend>
      <div className="avatar-swatches">
        {options.map((option) => (
          <label key={option.id} className="avatar-swatch" title={option.label}>
            <input
              type="radio"
              name={name}
              checked={option.id === value}
              aria-label={option.label}
              onChange={() => onChange(option.id)}
            />
            <span style={{ background: option.colour, borderColor: option.shade }} aria-hidden="true" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Choices shown as small avatars wearing each option.
function Thumbs<Id extends string>({
  legend,
  options,
  value,
  look,
  onChange,
}: {
  legend: string;
  options: { id: Id; label: string }[];
  value: Id;
  look: (id: Id) => Appearance;
  onChange: (value: Id) => void;
}) {
  const name = useId();
  return (
    <fieldset className="avatar-field">
      <legend>{legend}</legend>
      <div className="avatar-thumbs">
        {options.map((option) => (
          <label key={option.id} className="avatar-thumb">
            <input type="radio" name={name} checked={option.id === value} onChange={() => onChange(option.id)} />
            <span className="avatar-thumb-art" aria-hidden="true">
              <Avatar appearance={look(option.id)} size={THUMB_SIZE} label="" />
            </span>
            <span className="avatar-thumb-label">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
