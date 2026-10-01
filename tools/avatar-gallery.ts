// Renders the avatar review gallery to docs/design/avatar-gallery.html: the eight style-sheet looks, 24 random
// avatars from a fixed seed, and the edge cases, each at 32, 64 and 160 px. Run from the repository root:
//
//   npx vite-node tools/avatar-gallery.ts
//
// The page is static and self-contained. For the PNG beside it, screenshot the page in a Chromium browser, e.g.
//   msedge --headless --screenshot=docs/design/avatar-gallery.png --window-size=1240,4000 docs/design/avatar-gallery.html
import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_APPEARANCE, avatarCatalog, randomAppearance, type Appearance } from "@wannadoo/core";
import { Avatar } from "../apps/web/src/components/avatar/Avatar";

const OUT = "docs/design/avatar-gallery.html";
const SIZES = [32, 64, 160];

const look = (over: Partial<Appearance>): Appearance => ({ ...DEFAULT_APPEARANCE, ...over });

// The style sheet (docs/design/incoming/avatar-style-…-1.png), left to right, top row first.
const sheet: [string, Appearance][] = [
  ["Tousled, hoodie", look({ face: 0, age: 0, skin: 2, hair: "tousled", hairColour: 2, top: "hoodie", topColour: 0 })],
  [
    "Curly bun, knit jumper, earrings",
    look({
      face: 2,
      age: 0,
      skin: 6,
      hair: "bun",
      hairColour: 0,
      top: "jumper",
      topColour: 1,
      accessories: ["earrings"],
      background: 1,
    }),
  ],
  [
    "Long, denim jacket, earrings",
    look({
      face: 2,
      age: 0,
      skin: 2,
      hair: "long",
      hairColour: 0,
      top: "denim",
      topColour: 2,
      accessories: ["earrings"],
      background: 2,
    }),
  ],
  [
    "Beanie, striped shirt",
    look({
      face: 1,
      age: 0,
      skin: 1,
      hair: "short",
      hairColour: 5,
      top: "stripes",
      topColour: 3,
      accessories: ["beanie"],
    }),
  ],
  [
    "Curly, beard, cardigan",
    look({
      face: 0,
      age: 1,
      skin: 5,
      hair: "curly",
      hairColour: 0,
      facialHair: "beard",
      top: "cardigan",
      topColour: 1,
      background: 2,
    }),
  ],
  [
    "Bob, coral jumper, earrings",
    look({
      face: 2,
      age: 0,
      skin: 1,
      eyes: 3,
      hair: "bob",
      hairColour: 2,
      top: "jumper",
      topColour: 4,
      accessories: ["earrings"],
    }),
  ],
  [
    "Receding, glasses, beard, scarf",
    look({
      face: 0,
      age: 2,
      skin: 2,
      hair: "receding",
      hairColour: 7,
      facialHair: "beard",
      top: "jumper",
      topColour: 7,
      accessories: ["glasses", "scarf"],
      background: 1,
    }),
  ],
  [
    "Grey braid, scarf",
    look({
      face: 2,
      age: 2,
      skin: 2,
      hair: "braid",
      hairColour: 6,
      top: "cardigan",
      topColour: 5,
      accessories: ["earrings", "scarf"],
      background: 2,
    }),
  ],
];

// Mulberry32, so the random section repeats from run to run.
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seeded(2026);
const randoms: [string, Appearance][] = Array.from({ length: 24 }, (_, i) => [
  `Random ${i + 1}`,
  randomAppearance(random),
]);

const edges: [string, Appearance][] = [
  ["Bald with beanie", look({ hair: "bald", accessories: ["beanie"], background: 3 })],
  ["Long hair with scarf", look({ hair: "long", hairColour: 3, face: 2, accessories: ["scarf"], background: 4 })],
  [
    "Glasses and beard at age 2",
    look({ age: 2, hairColour: 6, hair: "short", facialHair: "beard", accessories: ["glasses"], skin: 4 }),
  ],
  [
    "Everything at once",
    look({ hair: "curly", facialHair: "beard", accessories: ["glasses", "beanie", "earrings", "scarf"] }),
  ],
  ...avatarCatalog.hair.map((h, i): [string, Appearance] => [
    `Beanie with ${h.label.toLowerCase()}`,
    look({ hair: h.id, accessories: ["beanie"], hairColour: i % 8, skin: (i * 3) % 8, background: i % 5 }),
  ]),
  ...avatarCatalog.age.map((g): [string, Appearance] => [
    `Glasses, ${g.label.toLowerCase()}`,
    look({ age: g.id, accessories: ["glasses"] }),
  ]),
  ...avatarCatalog.face.map((f): [string, Appearance] => [
    `Beard, ${f.label.toLowerCase()} face`,
    look({ face: f.id, facialHair: "beard", hair: "short", hairColour: 1, skin: 6 }),
  ]),
  ...avatarCatalog.face.map((f): [string, Appearance] => [
    `Stubble, ${f.label.toLowerCase()} face`,
    look({ face: f.id, facialHair: "stubble", hair: "buzz", hairColour: 0, skin: 3 }),
  ]),
  ...avatarCatalog.top.map((top, i): [string, Appearance] => [
    top.label,
    look({ top: top.id, topColour: (i * 3) % 8, face: i % 3 }),
  ]),
];

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function card([label, appearance]: [string, Appearance]) {
  const svgs = SIZES.map((size) => renderToStaticMarkup(createElement(Avatar, { appearance, size, label }))).join("");
  return `<figure><div class="sizes">${svgs}</div><figcaption>${escape(label)}</figcaption></figure>`;
}

const section = (title: string, note: string, items: [string, Appearance][]) =>
  `<section><h2>${title}</h2><p>${note}</p><div class="grid">${items.map(card).join("")}</div></section>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Avatar gallery</title>
<style>
  body { margin: 0; padding: 24px 16px 48px; background: #fbf0e2; color: #4a2a30; font: 14px/1.4 system-ui, sans-serif; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 32px 0 2px; }
  p { margin: 0 0 12px; color: #7a5a5e; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  figure { margin: 0; padding: 10px; background: #fff8ef; border-radius: 14px; }
  .sizes { display: flex; align-items: flex-end; gap: 10px; }
  figcaption { margin-top: 6px; font-size: 12px; color: #7a5a5e; }
</style>
</head>
<body>
<h1>Avatar gallery</h1>
<p>Generated by tools/avatar-gallery.ts from apps/web/src/components/avatar. Each avatar at 32, 64 and 160 px.</p>
${section("Style sheet looks", "The eight looks of the approved style sheet, rebuilt from parts.", sheet)}
${section("Random", "24 random avatars from seed 2026.", randoms)}
${section("Edge cases", "Combinations that could clip or float.", edges)}
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`Wrote ${OUT} (${Math.round(html.length / 1024)} KB)`);
