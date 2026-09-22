export type Stop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  eyebrow: string;
  prompt: string;
  image: string;
};

export type Trail = {
  id: string;
  name: string;
  location: string;
  description: string;
  curatorPick?: boolean;
  durationMinutes: number;
  stopCount: number;
  coverImage: string;
  stops: Stop[];
};

// PLACEHOLDER STOPS — real Riga city-centre landmarks, approximate coordinates.
// Swap lat/lng/name/prompt here once real stops are picked; nothing else needs to change.
export const trail: Trail = {
  id: "rediscover-riga",
  name: "Rediscover Riga",
  location: "Riga Old Town & Centre",
  description:
    "Five spots you've both walked past a hundred times. Slow down, notice them properly, and talk about something other than logistics for once.",
  curatorPick: true,
  durationMinutes: 75,
  stopCount: 5,
  coverImage: "https://picsum.photos/seed/wanderclue-riga-cover/800/600",
  stops: [
    {
      id: "freedom-monument",
      name: "Freedom Monument",
      lat: 56.9516,
      lng: 24.1144,
      radiusMeters: 75,
      eyebrow: "Stop 01 — Warm-up",
      prompt: "What's a small thing about this city you've never actually stopped to notice before today?",
      image:
        "https://picsum.photos/seed/wanderclue-freedom-monument/800/600",
    },
    {
      id: "vermanes-garden",
      name: "Vērmanes Garden",
      lat: 56.9532,
      lng: 24.1136,
      radiusMeters: 75,
      eyebrow: "Stop 02",
      prompt: "What's a hobby you've picked up recently, or one you keep wishing you had time for?",
      image:
        "https://picsum.photos/seed/wanderclue-vermanes-garden/800/600",
    },
    {
      id: "central-market",
      name: "Central Market",
      lat: 56.9459,
      lng: 24.1121,
      radiusMeters: 75,
      eyebrow: "Stop 03",
      prompt: "What's a decision — big or small — that quietly changed the direction of your life?",
      image:
        "https://picsum.photos/seed/wanderclue-central-market/800/600",
    },
    {
      id: "dome-square",
      name: "Dome Square",
      lat: 56.9489,
      lng: 24.1042,
      radiusMeters: 75,
      eyebrow: "Stop 04",
      prompt: "What's a compliment someone gave you that's stuck with you for years?",
      image:
        "https://picsum.photos/seed/wanderclue-dome-square/800/600",
    },
    {
      id: "riga-castle",
      name: "Riga Castle",
      lat: 56.9486,
      lng: 24.1008,
      radiusMeters: 75,
      eyebrow: "Stop 05 — Final",
      prompt: "What does a meaningful life look like to you right now — has the answer changed lately?",
      image:
        "https://picsum.photos/seed/wanderclue-riga-castle/800/600",
    },
  ],
};
