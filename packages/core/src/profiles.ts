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

// TEST PROFILES — the users seeded in the local Supabase stack, with their illustrated avatars.
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
