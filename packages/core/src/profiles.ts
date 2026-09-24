export type Profile = {
  id: string;
  name: string;
  username: string;
  email: string;
  initials: string;
  color: string;
  // Public path of the avatar illustration; falls back to initials on `color` when absent.
  avatar?: string;
};

// TEST PROFILES — placeholders until real accounts and the avatar creator exist.
export const PROFILES: Profile[] = [
  {
    id: "daniel",
    name: "Daniel",
    username: "daniel",
    email: "daniel@wannadoo.test",
    initials: "D",
    color: "#2a9d8f",
    avatar: "/avatar-daniel.png",
  },
  {
    id: "emma",
    name: "Emma",
    username: "emma",
    email: "emma@wannadoo.test",
    initials: "E",
    color: "#ff7a8a",
    avatar: "/avatar-emma.png",
  },
];

export function getProfile(id: string | null | undefined): Profile | null {
  return PROFILES.find((p) => p.id === id) ?? null;
}

export function findProfile(query: string, by: "username" | "email"): Profile | null {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (!q) return null;
  return PROFILES.find((p) => p[by].toLowerCase() === q) ?? null;
}

export function qrPayload(profile: Profile): string {
  return `wannadoo://link/${profile.username}`;
}

export function profileFromQr(payload: string): Profile | null {
  const match = payload.match(/^wannadoo:\/\/link\/(.+)$/);
  return match ? findProfile(match[1], "username") : null;
}
