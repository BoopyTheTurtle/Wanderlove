// Generates images with OpenAI's image API for the design workflow (docs/mvp-roadmap.md, section 6).
//
// Usage: node tools/images/generate.mjs <prompt-file.md> [count] [model] [quality] [size]
// Reads OPENAI_API_KEY from the environment and never prints it. Each image lands in docs/design/incoming/ as
// <prompt-name>-<model>-<timestamp>-<n>.png, with the prompt and settings saved beside it as a .json file.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

const [promptFile, count = "1", model = "gpt-image-2", quality = "medium", size = "1024x1536"] = process.argv.slice(2);
if (!promptFile) {
  console.error("Usage: node tools/images/generate.mjs <prompt-file.md> [count] [model] [quality] [size]");
  process.exit(1);
}
const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error("OPENAI_API_KEY is not set");
  process.exit(1);
}

// The prompt is everything after the first "## Prompt" heading, so the file can carry notes above it.
const text = readFileSync(promptFile, "utf8");
const prompt = (text.split(/^## Prompt\s*$/m)[1] ?? text).trim();
const name = basename(promptFile).replace(/\.md$/, "");
const outDir = join(process.cwd(), "docs", "design", "incoming");
mkdirSync(outDir, { recursive: true });

const res = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model, prompt, n: Number(count), quality, size }),
});
const body = await res.json();
if (!res.ok) {
  console.error("OpenAI error:", body.error?.message ?? res.status);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
body.data.forEach((img, i) => {
  const file = join(outDir, `${name}-${model}-${stamp}-${i + 1}.png`);
  writeFileSync(file, Buffer.from(img.b64_json, "base64"));
  console.log("saved", file);
});
writeFileSync(
  join(outDir, `${name}-${model}-${stamp}.json`),
  JSON.stringify({ model, quality, size, count: Number(count), usage: body.usage ?? null, prompt }, null, 2),
);
console.log("usage:", JSON.stringify(body.usage ?? "not reported"));
