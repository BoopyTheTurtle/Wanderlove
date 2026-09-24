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
  stopCount: 5,
  coverImage: "/sherlock-challenge.jpg",
  stops: [
    {
      id: "spikeri-promenade-clue1",
      name: "Spīķeri Promenade",
      lat: 56.9414308,
      lng: 24.1166392,
      radiusMeters: 60,
      eyebrow: "Clue 01 — The First Meeting",
      prompt:
        "Every love story begins with a first glance. Crack the code:\n❤️+❤️+❤️=15,\n❤️+⭐+⭐=11,\n⭐+🔑=7.\nWhat is 🔑+❤️×⭐?",
      image: "/spikeri-warehouses.jpg",
    },
    {
      id: "spikeri-warehouses-clue2",
      name: "Historic Spīķeri Warehouses",
      lat: 56.9421652,
      lng: 24.1155358,
      radiusMeters: 60,
      eyebrow: "Clue 02 — The Old Warehouse",
      prompt:
        "Some things survive for centuries, like these warehouses and the good in each other. Take turns: write three qualities you love in your partner, then pass the phone and let them answer back.",
      image: "/spikeri-warehouses.jpg",
    },
    {
      id: "spikeri-square-clue3",
      name: "Spīķeri Square",
      lat: 56.9429419,
      lng: 24.1123862,
      radiusMeters: 60,
      eyebrow: "Clue 03 — Holmes' Observation Test",
      prompt:
        "Count the first-floor windows of the nearest building — give your partner that many compliments. Then study each other for 30 seconds: eye colour, shoes, one accessory. Switch roles.",
      image: "/spikeri-warehouses.jpg",
    },
    {
      id: "spikeri-creative-quarter-clue4",
      name: "Creative Quarter",
      lat: 56.942348,
      lng: 24.1137619,
      radiusMeters: 60,
      eyebrow: "Clue 04 — The Hidden Message",
      prompt:
        "Sherlock left a coded note: L ORYH BRX. Use his favourite Caesar Cipher — shift each letter 3 places back — and decode the message together.",
      image: "/spikeri-warehouses.jpg",
    },
    {
      id: "daugava-bench-clue5",
      name: "Sunset Bench by the Daugava",
      lat: 56.9413577,
      lng: 24.1148153,
      radiusMeters: 60,
      eyebrow: "Clue 05 — Sunset Bench",
      prompt:
        "One of you describes a simple picture to the other from memory — without using the words left, right, top, or bottom — until they can sketch it accurately.",
      image: "/daugava-sunset.jpg",
    },
  ],
};
