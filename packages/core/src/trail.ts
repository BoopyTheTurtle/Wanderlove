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
  kind?: "curated" | "surprise";
  name: string;
  location: string;
  description: string;
  curatorPick?: boolean;
  durationMinutes: number;
  stopCount: number;
  coverImage: string;
  stops: Stop[];
  // Filled in for generated routes (and the curated trail once routed):
  distanceMeters?: number;
  distanceEstimated?: boolean;
  start?: { lat: number; lng: number };
  path?: [number, number][];
};

// Walking loop from Edgar's Google Maps itinerary: Spīķeri, the City Canal mouth, and
// Maskavas forštate, starting and ending at the Academy of Sciences.
// Coordinates are the itinerary's waypoints; names come from OpenStreetMap.
export const trail: Trail = {
  id: "rediscover-riga",
  kind: "curated",
  name: "Rediscover Riga",
  location: "Spīķeri & Maskavas forštate",
  description:
    "A slow loop through the old warehouse quarter and the riverside, past a wooden church and back up to the Academy. Notice the details, and talk about something other than logistics for once.",
  curatorPick: true,
  durationMinutes: 60,
  stopCount: 7,
  coverImage: "https://picsum.photos/seed/wanderclue-riga-cover/800/600",
  stops: [
    {
      id: "academy-square",
      name: "Academy of Sciences Square",
      lat: 56.9435248,
      lng: 24.1212065,
      radiusMeters: 60,
      eyebrow: "Stop 01 — Warm-up",
      prompt: "What's a small thing about this city you've never actually stopped to notice before today?",
      image: "https://picsum.photos/seed/wannadoo-academy-square/800/600",
    },
    {
      id: "spikeri-warehouses",
      name: "Spīķeri Warehouses",
      lat: 56.9421424,
      lng: 24.1151476,
      radiusMeters: 60,
      eyebrow: "Stop 02",
      prompt: "What's a hobby you've picked up recently, or one you keep wishing you had time for?",
      image: "https://picsum.photos/seed/wannadoo-spikeri-warehouses/800/600",
    },
    {
      id: "meness-aptieka",
      name: "Mēness aptieka",
      lat: 56.9434456,
      lng: 24.1150767,
      radiusMeters: 50,
      eyebrow: "Stop 03",
      prompt: "If you could bottle one feeling from our time together, which one would it be?",
      image: "https://picsum.photos/seed/wannadoo-meness-aptieka/800/600",
    },
    {
      id: "city-canal-mouth",
      name: "City Canal Mouth",
      lat: 56.9432519,
      lng: 24.1112417,
      radiusMeters: 60,
      eyebrow: "Stop 04",
      prompt: "What's a decision — big or small — that quietly changed the direction of your life?",
      image: "https://picsum.photos/seed/wannadoo-city-canal/800/600",
    },
    {
      id: "spikeri-promenade",
      name: "Spīķeri Promenade",
      lat: 56.9413654,
      lng: 24.1147471,
      radiusMeters: 60,
      eyebrow: "Stop 05",
      prompt: "What's a compliment someone gave you that's stuck with you for years?",
      image: "https://picsum.photos/seed/wannadoo-spikeri-promenade/800/600",
    },
    {
      id: "jesus-church",
      name: "Jesus Church",
      lat: 56.9413381,
      lng: 24.123354,
      radiusMeters: 60,
      eyebrow: "Stop 06",
      prompt: "Who's someone who shaped the person you are, that I've never really heard much about?",
      image: "https://picsum.photos/seed/wannadoo-jesus-church/800/600",
    },
    {
      id: "academy-terrace",
      name: "Academy of Sciences Terrace",
      lat: 56.9435849,
      lng: 24.1211841,
      radiusMeters: 60,
      eyebrow: "Stop 07 — Final",
      prompt: "What does a meaningful life look like to you right now — has the answer changed lately?",
      image: "https://picsum.photos/seed/wannadoo-academy-terrace/800/600",
    },
  ],
};
