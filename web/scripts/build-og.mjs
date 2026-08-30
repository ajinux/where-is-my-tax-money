// Share cards, drawn at build time.
//
// The site declared `twitter:card=summary_large_image` and shipped no image at
// all, so every link anyone shared rendered as a bare box. These are the images
// that box was asking for.
//
// A plain Node script rather than an Astro endpoint, following the convention
// scripts/build-data.mjs already set. @resvg/resvg-js is a native .node addon;
// behind an Astro endpoint it goes through Vite's SSR bundling, which is exactly
// where that breaks, and the fix is a config incantation debugged on a CI runner.
// Here it is just a require.
//
// What cannot be done statically: a card carrying the reader's own figure. The
// amount is unbounded free text in a query string, and GitHub Pages serves
// identical HTML whatever the query string says, so one HTML file can only ever
// name one image. Per-share cards need an edge worker rewriting the meta tags;
// see web/README.md.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

import { palette, toHex } from "./og/palette.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "public", "og");
const SUMMARY = join(HERE, "..", "src", "data", "summary.json");
const ENTITIES = join(HERE, "..", "src", "data", "entities.json");
const FAVICON = join(HERE, "..", "public", "favicon.svg");

const WIDTH = 1200;
const HEIGHT = 630;
const BAR_MAX = 520;

const summary = JSON.parse(readFileSync(SUMMARY, "utf8"));
const entities = JSON.parse(readFileSync(ENTITIES, "utf8"));

/**
 * Font buffers for satori, which cannot read woff2, only ttf, otf and woff.
 *
 * Vendored through @fontsource and resolved from node_modules rather than
 * fetched from Google at build time: `npm ci` on a clean runner already has
 * them, and a build that reaches the network is a build that fails on a bad
 * afternoon.
 *
 * The latin-ext faces are registered under their OWN family names, and that is
 * the whole trick. satori does not fall through between two faces sharing a
 * family name and weight, it takes the first and draws .notdef for anything the
 * face lacks. Registering ext as a separate family puts it in satori's fallback
 * chain instead, where a missing glyph does reach it.
 *
 * It has to reach it, because the rupee sign U+20B9 is in latin-ext and nowhere
 * else: Figtree's latin subset does not carry it, and Caprasimo does not carry it
 * in either subset. Every ₹ on these cards was rendering as a tofu box until the
 * families were split, which is exactly the sort of thing nobody sees until the
 * card is already on someone else's timeline.
 */
function font(specifier, name, weight) {
  return {
    name,
    weight,
    style: "normal",
    data: readFileSync(fileURLToPath(import.meta.resolve(specifier))),
  };
}

const fonts = [
  font("@fontsource/figtree/files/figtree-latin-400-normal.woff", "Figtree", 400),
  font("@fontsource/figtree/files/figtree-latin-700-normal.woff", "Figtree", 700),
  font("@fontsource/figtree/files/figtree-latin-ext-400-normal.woff", "FigtreeExt", 400),
  font("@fontsource/figtree/files/figtree-latin-ext-700-normal.woff", "FigtreeExt", 700),
  font("@fontsource/caprasimo/files/caprasimo-latin-400-normal.woff", "Caprasimo", 400),
];

/** Headings are Caprasimo, which has no ₹ at all, so it names a fallback. */
const HEADING_FAMILY = "Caprasimo, FigtreeExt";
const BODY_FAMILY = "Figtree, FigtreeExt";

/**
 * Prove the font set can actually draw the characters these cards depend on.
 *
 * satori renders an unavailable glyph as .notdef, a hollow box, and says
 * nothing about it. Scanning the output SVG for that box does not work: the path
 * is a plain rectangle, and so is the en dash in "2025–26", so the check would
 * either miss the failure or fire on every card.
 *
 * So test the input instead. Draw each character that matters, draw a character
 * no Latin face could possibly have, and compare the two paths: identical means
 * both came out as .notdef. Run once at startup, against the real font list, at
 * the real family names, which is precisely the thing that was silently wrong.
 */
async function assertGlyphs() {
  const draw = async (family, char, size) => {
    const svg = await satori(
      { type: "div", props: { style: { display: "flex", fontFamily: family, fontSize: size }, children: char } },
      { width: 200, height: 200, fonts }
    );
    return (svg.match(/ d="([^"]*)"/) ?? [, ""])[1];
  };

  for (const family of [BODY_FAMILY, HEADING_FAMILY]) {
    // U+4F60 is CJK: no subset of Figtree or Caprasimo can carry it, so whatever
    // it draws is this font set's .notdef by definition.
    const notdef = await draw(family, "\u4f60", 40);
    for (const char of ["\u20b9", "\u2013", "%"]) {
      const drawn = await draw(family, char, 40);
      if (!drawn || drawn === notdef) {
        throw new Error(
          `No font in the set can draw ${JSON.stringify(char)} in "${family}". ` +
            "The rupee sign lives in latin-ext and nowhere else, check that the ext " +
            "faces are still registered under their own family names."
        );
      }
    }
  }
}

/**
 * satori takes React elements or the plain objects React elements compile to.
 * This script is .mjs outside Astro's transform, so it uses the objects directly
 * rather than dragging a JSX pipeline in for six shapes.
 *
 * Two satori defaults differ from a browser and cause most of the confusion:
 * every element defaults to `display: flex`, and any element with more than one
 * child must declare it explicitly.
 */
const el = (style, children) => ({
  type: "div",
  props: { style, children },
});
const text = (style, value) => ({ type: "div", props: { style, children: value } });

/** ₹49.65 lakh cr, the same rounding the site uses beside every row. */
function croreShort(rupees) {
  const crore = rupees / 1e7;
  if (crore >= 100000) return `₹${(crore / 100000).toFixed(crore >= 1000000 ? 1 : 2)} lakh cr`;
  if (crore >= 1000) return `₹${Math.round(crore / 1000) * 1000} cr`;
  return `₹${Math.round(crore)} cr`;
}

function bars(rows) {
  const widest = rows.reduce((max, row) => Math.max(max, row.amountRupees), 0);
  return el({ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }, [
    ...rows.map((row) =>
      el({ display: "flex", alignItems: "center", gap: 16 }, [
        el({
          display: "flex",
          height: 22,
          borderRadius: 999,
          backgroundColor: toHex(row.tone ?? palette.accent500),
          width: Math.max(Math.round((row.amountRupees / widest) * BAR_MAX), 10),
        }),
        text({ fontSize: 20, fontWeight: 400, color: palette.mid }, row.label),
      ])
    ),
  ]);
}

/** The shared frame. Everything below only chooses what goes in it. */
function card({ headline, sub, rows, footer, headlineSize = 62 }) {
  return el(
    {
      width: WIDTH,
      height: HEIGHT,
      display: "flex",
      flexDirection: "column",
      backgroundColor: palette.bg,
      padding: "56px 64px",
      fontFamily: BODY_FAMILY,
      color: palette.text,
    },
    [
      el({ display: "flex", alignItems: "center", gap: 12 }, [
        el({
          display: "flex",
          width: 26,
          height: 26,
          borderRadius: 999,
          backgroundColor: palette.accent500,
        }),
        text(
          { fontSize: 22, fontWeight: 700, color: palette.mid, letterSpacing: "-0.01em" },
          "whereismytaxmoney.com"
        ),
      ]),

      text(
        {
          fontFamily: HEADING_FAMILY,
          fontSize: headlineSize,
          lineHeight: 1.04,
          letterSpacing: "-0.02em",
          marginTop: 26,
          maxWidth: 1010,
        },
        headline
      ),

      text({ fontSize: 26, color: palette.mid, marginTop: 16, maxWidth: 940 }, sub),

      el({ display: "flex", flexDirection: "column", marginTop: "auto" }, [
        ...(rows.length ? [bars(rows)] : []),
        text({ fontSize: 20, color: palette.muted, marginTop: 26 }, footer),
      ]),
    ]
  );
}

async function render(name, tree) {
  const svg = await satori(tree, { width: WIDTH, height: HEIGHT, fonts });
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
    // satori has already converted every glyph to a path, so there is nothing
    // left for resvg to resolve, and asking it not to look keeps the output
    // identical on a developer's Mac and on a bare CI runner.
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
  writeFileSync(join(OUT, `${name}.png`), png);
  return png.length;
}

// --- what gets a card ------------------------------------------------------
//
// A card is only worth generating for a URL that can name it. That is why there
// are nineteen rather than one: the reference pages under /where and /year are
// real addresses now, so each can carry its own. Ministries, demands and states
// fall back to their category's card, 102 near-identical demand cards would be
// 102 files nobody distinguishes.

const newest = entities.years[0];
const stripTop = (rows, count = 8) => rows.slice(0, count);

const variants = [
  {
    name: "default",
    headline: "They spent it. You never saw the bill.",
    sub: "Enter what you paid in income tax and see exactly where it went.",
    rows: stripTop(summary.strip),
    footer: `Ministry of Finance figures, ${summary.yearRange}`,
  },
  {
    name: "method",
    headline: "Where your income tax actually goes",
    sub: `Only the base part is shared with states, at the ${newest.divisiblePoolPercent}% rate the ${
      newest.awardLabel ?? "Finance Commission"
    } sets. Cess and surcharge are not shared at all.`,
    rows: [
      {
        label: `${newest.divisiblePoolPercent}% to your state government`,
        amountRupees: newest.divisiblePoolPercent,
        tone: palette.accent500,
      },
      {
        label: `${100 - newest.divisiblePoolPercent}% stays with the union`,
        amountRupees: 100 - newest.divisiblePoolPercent,
        tone: palette.accent2,
      },
    ],
    footer: `Ministry of Finance figures, ${summary.yearRange}`,
    headlineSize: 58,
  },
  ...entities.purposes.map((purpose) => {
    const amount = purpose.amounts[newest.id] ?? 0;
    const share = newest.unionTotal ? (amount / newest.unionTotal) * 100 : 0;
    return {
      name: `where-${purpose.slug}`,
      headline: purpose.label,
      sub: `${croreShort(amount)} in ${newest.label}, ${share.toFixed(
        1
      )}% of everything the union government spent.`,
      rows: stripTop(
        entities.purposes
          .filter((other) => other.amounts[newest.id] != null)
          .map((other) => ({
            label: other.label,
            amountRupees: other.amounts[newest.id],
            // The category this card is about keeps its colour; the rest recede,
            // so the bar the headline names is the one the eye finds.
            tone: other.id === purpose.id ? other.tone : palette.surface,
          })),
        9
      ),
      footer: `Ministry of Finance figures, ${newest.label}`,
      headlineSize: purpose.label.length > 34 ? 52 : 62,
    };
  }),
  ...entities.years.map((year) => ({
    name: `year-${year.id}`,
    headline: `The union budget, ${year.label}`,
    sub: `${croreShort(year.unionTotal)} spent, ${croreShort(
      year.devolutionTotal
    )} devolved to the states.`,
    rows: stripTop(
      entities.purposes
        .filter((purpose) => purpose.amounts[year.id] != null)
        .map((purpose) => ({
          label: purpose.label,
          amountRupees: purpose.amounts[year.id],
          tone: purpose.tone,
        }))
        .sort((a, b) => b.amountRupees - a.amountRupees)
    ),
    footer: `${year.tag} · Ministry of Finance`,
  })),
];

await assertGlyphs();
mkdirSync(OUT, { recursive: true });

let bytes = 0;
for (const variant of variants) {
  bytes += await render(variant.name, card(variant));
}

// The one non-card asset: Base.astro links an apple-touch-icon, and Safari wants
// a PNG. Rendering it from the same favicon.svg keeps one drawing of the mark.
const icon = new Resvg(readFileSync(FAVICON, "utf8"), {
  fitTo: { mode: "width", value: 180 },
  font: { loadSystemFonts: false },
})
  .render()
  .asPng();
writeFileSync(join(OUT, "apple-touch-icon.png"), icon);

console.log(
  `Wrote ${variants.length} share cards to public/og/ (${(bytes / 1024).toFixed(0)} KB total) ` +
    `plus apple-touch-icon.png`
);
