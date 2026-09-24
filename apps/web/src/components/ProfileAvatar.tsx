import type { Profile } from "@wannadoo/core";

// The profile's avatar illustration, or its initials on its colour when it has none.
export function ProfileAvatar({ profile, size = 44 }: { profile: Profile | null; size?: number }) {
  if (!profile) {
    return (
      <span
        className="profile-avatar empty"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        aria-label="No partner yet"
      >
        ?
      </span>
    );
  }
  if (profile.avatar) {
    return (
      <img
        className="profile-avatar"
        src={profile.avatar}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        alt={profile.name}
      />
    );
  }
  return (
    <span
      className="profile-avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, background: profile.color }}
      aria-label={profile.name}
      role="img"
    >
      {profile.initials}
    </span>
  );
}
