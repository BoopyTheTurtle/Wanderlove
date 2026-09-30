import { useContext } from "react";
import { ChatIcon, CompassIcon, HeartIcon, UserIcon } from "./Icons";
import { NavContext, type NavTab } from "./nav";

const ITEMS = [
  { id: "explore", label: "Explore", Icon: CompassIcon },
  { id: "activity", label: "Activity", Icon: HeartIcon },
  { id: "messages", label: "Messages", Icon: ChatIcon },
  { id: "profile", label: "Profile", Icon: UserIcon },
] as const;

// A tab is enabled when it is the active one or has a handler, from the props or else from NavContext. The active tab
// takes only a handler from the props, such as Explore on the map leading back home; the rest show "coming soon".
export function BottomNav({
  active = "explore",
  onExplore,
  onProfile,
}: {
  active?: NavTab;
  onExplore?: () => void;
  onProfile?: () => void;
} = {}) {
  const nav = useContext(NavContext);
  const own: Partial<Record<string, () => void>> = { explore: onExplore, profile: onProfile };

  return (
    <nav className="bottom-nav" aria-label="Main">
      {ITEMS.map(({ id, label, Icon }) => {
        const current = id === active;
        const onClick = own[id] ?? (current || id === "messages" ? undefined : nav[id]);
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
