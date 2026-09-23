export type Profile = {
  id: string;
  name: string;
  username: string;
  email: string;
  initials: string;
  color: string;
};

// TEST PROFILES — placeholders until real accounts and the avatar creator exist.
export const PROFILES: Profile[] = [
  {
    id: "daniel",
    name: "Daniel",
    username: "daniel",
    email: "daniel@wanderclue.test",
    initials: "D",
    color: "#2a9d8f",
  },
  {
    id: "emma",
    name: "Emma",
    username: "emma",
    email: "emma@wanderclue.test",
    initials: "E",
    color: "#ff7a8a",
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
  return `wanderclue://link/${profile.username}`;
}

export function profileFromQr(payload: string): Profile | null {
  const match = payload.match(/^wanderclue:\/\/link\/(.+)$/);
  return match ? findProfile(match[1], "username") : null;
}
