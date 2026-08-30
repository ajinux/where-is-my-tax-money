// Colour for the share cards.
//
// satori draws with a CSS subset whose colour parser handles rgb/hsl/hex and
// nothing else. This codebase is entirely oklch: every value in
// src/data/tones.json, every ministry tone generated in build-data.mjs, and the
// design tokens referenced as `var(--color-accent-500)`. Passing any of them to
// satori paints black, silently.
//
// The obvious fix is a hand-written hex table beside tones.json. This does the
// conversion instead, and reads the design tokens out of organic.css, because a
// second table of colours is a second thing to update when a hue changes, and
// the failure mode of forgetting is a black bar in a share card that nobody
// looks at until it is on someone else's timeline.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = join(HERE, "..", "..", "src", "styles", "organic.css");

/** `--color-accent-500: #d67f48` → tokens.get("--color-accent-500"). */
function readTokens() {
  const css = readFileSync(CSS, "utf8");
  const tokens = new Map();
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

const tokens = readTokens();

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Linear-light sRGB channel → 8-bit gamma-encoded. */
function encode(channel) {
  const v = channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
  return Math.round(clamp01(v) * 255)
    .toString(16)
    .padStart(2, "0");
}

/**
 * OKLCH → sRGB hex, by Björn Ottosson's matrices.
 *
 * Out-of-gamut colours are clipped per channel rather than gamut-mapped. Every
 * tone in this project was chosen at a matched lightness and chroma that sits
 * inside sRGB, so clipping is a guard rather than a rendering strategy.
 */
export function oklchToHex(lightness, chroma, hueDegrees) {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return (
    "#" +
    encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) +
    encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) +
    encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  );
}

/**
 * Any colour this codebase writes → a hex string satori can parse.
 *
 * Throws rather than falling back to a default. A share card is the one artefact
 * nobody reviews before it reaches other people's timelines, so a colour this
 * cannot resolve should stop the build, not paint something plausible.
 */
export function toHex(value, seen = new Set()) {
  if (!value) throw new Error("toHex: no colour given");
  const text = String(value).trim();

  if (text.startsWith("#")) return text;

  const variable = text.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i);
  if (variable) {
    const name = variable[1];
    if (seen.has(name)) throw new Error(`toHex: ${name} refers to itself`);
    const resolved = tokens.get(name);
    if (!resolved) throw new Error(`toHex: ${name} is not defined in organic.css`);
    return toHex(resolved, new Set([...seen, name]));
  }

  const oklch = text.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i);
  if (oklch) return oklchToHex(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]));

  throw new Error(`toHex: cannot parse ${text}`);
}

/** The card's own palette, read from the same tokens the site is drawn with. */
export const palette = {
  bg: toHex(tokens.get("--color-bg")),
  surface: toHex(tokens.get("--color-surface")),
  text: toHex(tokens.get("--color-text")),
  accent: toHex(tokens.get("--color-accent")),
  accent2: toHex(tokens.get("--color-accent-2")),
  accent500: toHex(tokens.get("--color-accent-500")),
  muted: toHex(tokens.get("--color-neutral-700")),
  mid: toHex(tokens.get("--color-neutral-800")),
};
