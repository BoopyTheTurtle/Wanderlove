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

// Romantic mystery walk through Spīķeri, based on the Sherlock Holmes challenge.
// A love letter written 100 years ago disappeared in Riga — couples follow five clues
// to uncover the final hidden message together.
export const trail: Trail = {
  id: "sherlock-holmes-spikeri",
  kind: "curated",
  name: "Sherlock Holmes: The Missing Love Letter",
  location: "Spīķeri, Riga",
  description:
    "A love letter written over 100 years ago vanished in the Spīķeri district. Follow five clues together, crack codes, and uncover the secret message hidden along the Daugava.",
  curatorPick: true,
  durationMinutes: 75,
  stopCount: 6,
  coverImage: "https://picsum.photos/seed/sherlock-holmes-spikeri-cover/800/600",
  stops: [
    {
      id: "spikeri-promenade-clue1",
      name: "Spīķeri Promenade",
      lat: 56.9413654,
      lng: 24.1147471,
      radiusMeters: 60,
      eyebrow: "Clue 01 — The First Meeting",
      prompt:
        "Every love story begins with a first glance. Crack the code: ❤️+❤️+❤️=15, ❤️+⭐+⭐=11, ⭐+🔑=7. What is 🔑+❤️×⭐?",
      image: "https://picsum.photos/seed/sherlock-spikeri-promenade/800/600",
    },
    {
      id: "spikeri-warehouses-clue2",
      name: "Historic Spīķeri Warehouses",
      lat: 56.9421424,
      lng: 24.1151476,
      radiusMeters: 60,
      eyebrow: "Clue 02 — The Old Warehouse",
      prompt:
        "Some things survive for centuries. Together, name three qualities that strengthen your relationship — then each write one thing you appreciate about the other and read them aloud.",
      image: "https://picsum.photos/seed/sherlock-spikeri-warehouses/800/600",
    },
    {
      id: "spikeri-square-clue3",
      name: "Spīķeri Square",
      lat: 56.9417,
      lng: 24.1142,
      radiusMeters: 60,
      eyebrow: "Clue 03 — Holmes' Observation Test",
      prompt:
        "Count the first-floor windows of the nearest building — give your partner that many compliments. Then study each other for 30 seconds: eye colour, shoes, one accessory. Switch roles.",
      image: "https://picsum.photos/seed/sherlock-spikeri-square/800/600",
    },
    {
      id: "spikeri-creative-quarter-clue4",
      name: "Creative Quarter",
      lat: 56.9418,
      lng: 24.1133,
      radiusMeters: 60,
      eyebrow: "Clue 04 — The Hidden Message",
      prompt:
        "Sherlock left a coded note: L ORYH BRX. Use his favourite Caesar Cipher — shift each letter 3 places back — and decode the message together.",
      image: "https://picsum.photos/seed/sherlock-creative-quarter/800/600",
    },
    {
      id: "daugava-bench-clue5",
      name: "Sunset Bench by the Daugava",
      lat: 56.9406,
      lng: 24.1148,
      radiusMeters: 60,
      eyebrow: "Clue 05 — Sunset Bench",
      prompt:
        "One of you describes a simple structure to the other from memory — without using the words left, right, top, or bottom — until they can sketch it accurately.",
      image: "https://picsum.photos/seed/sherlock-daugava-bench/800/600",
    },
    {
      id: "spikeri-courtyard-final",
      name: "Spīķeri Courtyard",
      lat: 56.9416,
      lng: 24.115,
      radiusMeters: 60,
      eyebrow: "Final — The Lost Letter",
      prompt:
        "Arrange your five collected words in order — the lost letter's secret is revealed. Write one adventure you will have together in the next 12 months, seal it, and open it on your anniversary.",
      image: "https://picsum.photos/seed/sherlock-spikeri-courtyard/800/600",
    },
  ],
};
