import { ChatIcon, CompassIcon, HeartIcon, UserIcon } from "./Icons";

type Tab = "explore" | "profile";

const ITEMS = [
  { id: "explore", label: "Explore", Icon: CompassIcon },
  { id: "activity", label: "Activity", Icon: HeartIcon },
  { id: "messages", label: "Messages", Icon: ChatIcon },
  { id: "profile", label: "Profile", Icon: UserIcon },
] as const;

// With no props it shows Explore as the current tab and the rest as "coming soon".
// A tab becomes enabled when it is the active one or gets a handler.
export function BottomNav({
  active = "explore",
  onExplore,
  onProfile,
}: {
  active?: Tab;
  onExplore?: () => void;
  onProfile?: () => void;
} = {}) {
  const handlers: Partial<Record<string, () => void>> = { explore: onExplore, profile: onProfile };

  return (
    <nav className="bottom-nav" aria-label="Main">
      {ITEMS.map(({ id, label, Icon }) => {
        const current = id === active;
        const onClick = current ? undefined : handlers[id];
        const enabled = current || onClick !== undefined;
        return (
          <button
            key={id}
            type="button"
            className={current ? "active" : ""}
            aria-current={current ? "page" : undefined}
            aria-disabled={!enabled}
            title={enabled ? label : `${label} — coming soon`}
            onClick={onClick}
            style={onClick ? { cursor: "pointer" } : undefined}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        );
      })}
      <span className="home-indicator" aria-hidden="true" />
    </nav>
  );
}
