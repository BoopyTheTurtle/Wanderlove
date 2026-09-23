import type { Profile } from "@wannadoo/core";

// Placeholder avatar: initials on the profile's colour. Swap for the avatar creator later.
export function ProfileAvatar({ profile, size = 44 }: { profile: Profile | null; size?: number }) {
  if (!profile) {
    return (
      <span className="profile-avatar empty" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-label="No partner yet">
        ?
      </span>
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
