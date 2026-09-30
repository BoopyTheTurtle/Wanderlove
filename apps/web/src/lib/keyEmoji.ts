// The emoji check for a linked pair's photo keys (docs/photo-encryption.md, section 4). Both phones turn the same two
// key IDs into the same four emoji, so the partners can compare screens: a key swapped on the server shows different
// emoji on each phone. Four emoji from 64 carry 24 bits: enough to catch a swap, not to stop an attacker who can
// generate keys until the emoji collide.

export type KeyEmoji = { char: string; name: string };

// 64 everyday emoji, each a single code point with emoji presentation, chosen so no two look alike.
export const KEY_EMOJI: readonly KeyEmoji[] = [
  { char: "🐶", name: "dog" },
  { char: "🐱", name: "cat" },
  { char: "🐰", name: "rabbit" },
  { char: "🦊", name: "fox" },
  { char: "🐻", name: "bear" },
  { char: "🐼", name: "panda" },
  { char: "🐯", name: "tiger" },
  { char: "🐞", name: "ladybird" },
  { char: "🐷", name: "pig" },
  { char: "🐸", name: "frog" },
  { char: "🐵", name: "monkey" },
  { char: "🐔", name: "chicken" },
  { char: "🐧", name: "penguin" },
  { char: "🦉", name: "owl" },
  { char: "🐝", name: "bee" },
  { char: "🦋", name: "butterfly" },
  { char: "🐌", name: "snail" },
  { char: "🐢", name: "turtle" },
  { char: "🐙", name: "octopus" },
  { char: "🐬", name: "dolphin" },
  { char: "🦀", name: "crab" },
  { char: "🐘", name: "elephant" },
  { char: "🦒", name: "giraffe" },
  { char: "🐴", name: "horse" },
  { char: "🍎", name: "apple" },
  { char: "🥑", name: "avocado" },
  { char: "🍇", name: "grapes" },
  { char: "🍓", name: "strawberry" },
  { char: "🍋", name: "lemon" },
  { char: "🍉", name: "watermelon" },
  { char: "🍍", name: "pineapple" },
  { char: "🥕", name: "carrot" },
  { char: "🌽", name: "corn" },
  { char: "🍄", name: "mushroom" },
  { char: "🧀", name: "cheese" },
  { char: "🍕", name: "pizza" },
  { char: "🍩", name: "doughnut" },
  { char: "🎂", name: "cake" },
  { char: "🍦", name: "ice cream" },
  { char: "☕", name: "coffee" },
  { char: "🌙", name: "moon" },
  { char: "⭐", name: "star" },
  { char: "🌈", name: "rainbow" },
  { char: "🔥", name: "fire" },
  { char: "🌵", name: "cactus" },
  { char: "🌻", name: "sunflower" },
  { char: "🌲", name: "fir tree" },
  { char: "🍀", name: "clover" },
  { char: "⛵", name: "sailboat" },
  { char: "🚲", name: "bicycle" },
  { char: "🚗", name: "car" },
  { char: "🚀", name: "rocket" },
  { char: "🚂", name: "train" },
  { char: "🎈", name: "balloon" },
  { char: "🎸", name: "guitar" },
  { char: "🥁", name: "drum" },
  { char: "⚽", name: "football" },
  { char: "🎲", name: "dice" },
  { char: "🔑", name: "key" },
  { char: "🔔", name: "bell" },
  { char: "💡", name: "light bulb" },
  { char: "📚", name: "books" },
  { char: "⏰", name: "alarm clock" },
  { char: "🧦", name: "socks" },
];

// Four emoji for a pair of key IDs. Sorting first makes the order of the two IDs irrelevant, so each phone can pass
// its own ID first. SHA-256 spreads a change in either key across all four.
export async function pairEmoji(keyIdA: string, keyIdB: string): Promise<KeyEmoji[]> {
  const [first, second] = [keyIdA, keyIdB].sort();
  const input = new TextEncoder().encode(`wannadoo-pair:${first}:${second}`);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", input));
  // The first three bytes are 24 bits: four indexes of six bits each.
  const bits = (digest[0] << 16) | (digest[1] << 8) | digest[2];
  return [18, 12, 6, 0].map((shift) => KEY_EMOJI[(bits >> shift) & 63]);
}
