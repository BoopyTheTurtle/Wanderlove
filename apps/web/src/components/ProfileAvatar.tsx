import type { Profile } from "@wannadoo/core";
import { Avatar } from "./avatar";
import { useAvatarState } from "../lib/avatar";

// The profile's avatar: the drawn avatar when the person has one (lib/avatar.ts, AvatarContext), a plain circle while
// it loads, else the illustration of a seeded test profile, else initials on a colour.
export function ProfileAvatar({ profile, size = 44 }: { profile: Profile | null; size?: number }) {
  const avatar = useAvatarState(profile?.id);
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
  if (avatar === "loading") {
    return (
      <span
        className="profile-avatar placeholder"
        style={{ width: size, height: size }}
        aria-label={profile.name}
        role="img"
      />
    );
  }
  if (avatar) {
    return (
      <span className="profile-avatar drawn" style={{ width: size, height: size }}>
        <Avatar appearance={avatar} size={size} label={profile.name} />
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
