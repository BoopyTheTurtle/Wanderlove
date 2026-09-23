import { ChatIcon, CompassIcon, HeartIcon, UserIcon } from "./Icons";

const ITEMS = [
  { id: "explore", label: "Explore", Icon: CompassIcon, enabled: true },
  { id: "activity", label: "Activity", Icon: HeartIcon, enabled: false },
  { id: "messages", label: "Messages", Icon: ChatIcon, enabled: false },
  { id: "profile", label: "Profile", Icon: UserIcon, enabled: false },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {ITEMS.map(({ id, label, Icon, enabled }) => (
        <button
          key={id}
          type="button"
          className={enabled ? "active" : ""}
          aria-current={enabled ? "page" : undefined}
          aria-disabled={!enabled}
          title={enabled ? label : `${label} — coming soon`}
        >
          <Icon size={21} />
          <span>{label}</span>
        </button>
      ))}
      <span className="home-indicator" aria-hidden="true" />
    </nav>
  );
}
