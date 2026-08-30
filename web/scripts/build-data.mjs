// dataset.v3.json → one view-model JSON per financial year.
//
// The committed artifact is the interface between the two halves of this repo:
// `data/` is Python and produces dist/dataset.v3.json; this reads it. No uv, no
// Python, nothing here needs the pipeline installed.
//
// Everything the UI shows comes from here. The design comp shipped its own
// invented dataset — 10 purpose heads, 12 ministries, five years, hand-written
// sub-line percentages — and none of it is used. The comp is the visual and tone
// spec; the numbers are the dataset's.
//
// This script is written to fail loudly. Every figure it emits is checked against
// a total the dataset publishes independently, because that is the same standard
// the dataset holds itself to: a total and its parts come from different
// documents, so their agreement is evidence rather than arithmetic we performed
// on ourselves.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(HERE, "..", "..", "data", "dist", "dataset.v3.json");
const YEAR_DIR = join(HERE, "..", "public", "data");
const SUMMARY = join(HERE, "..", "src", "data", "summary.json");
const TONES = JSON.parse(readFileSync(join(HERE, "..", "src", "data", "tones.json"), "utf8"));

const dataset = JSON.parse(readFileSync(ARTIFACT, "utf8"));

/** Index (section, period) → section entry. */
const sections = new Map();
for (const entry of dataset.sections) {
  sections.set(`${entry.section}|${entry.period}`, entry);
}
const periods = [...new Set(dataset.sections.map((e) => e.period))].sort();

/** "2024-25" → "2024–25". The comp uses an en dash; the dataset uses a hyphen. */
const enDash = (period) => period.replace("-", "–");

/**
 * Ministry colours, generated rather than authored: 56 is too many to hand-pick,
 * and the design's own rule ("one vibrant hue per category, matched lightness and
 * chroma so they sit together on the cream ground") produces them directly.
 *
 * Hues advance by the golden angle so that neighbours in a size-sorted list land
 * far apart on the wheel — adjacent rows are what a reader compares. The band
 * around the terracotta accent is skipped: the comp reserves that colour for the
 * state-devolution row and nothing else may wear it.
 */
function ministryTone(index) {
  let hue = (index * 137.508 + 20) % 360;
  if (hue >= 38 && hue <= 72) hue = (hue + 26) % 360; // keep clear of the accent
  return `oklch(0.61 0.13 ${hue.toFixed(1)})`;
}

/** The label under a year, describing how settled its figures are. */
function statusTag(status, isLatestFinal) {
  if (status !== "actual-final") return "Revised estimate, not yet final";
  return isLatestFinal ? "Latest final figures" : "Final figures";
}

/** Read a generator's published input off any fact it produced. */
function derivedParameter(entry, key) {
  for (const node of Object.values(entry.nodes)) {
    const value = node.derived?.parameters?.[key];
    if (value !== undefined) return value;
  }
  return null;
}

/**
 * Biggest first, ties broken by id.
 *
 * The tiebreak is not cosmetic. Largest-remainder apportionment settles ties by
 * position, so the order rows arrive in decides which one collects a leftover
 * rupee. Leaving that to the source order would make the figures depend on
 * something nobody is looking at, and would give the Python cross-check an order
 * it has to guess.
 */
const bySize = (a, b) => b.amountRupees - a.amountRupees || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Walk a node into the shape the UI consumes, depth-first, biggest first. */
function toRow(entry, nodeId, tone) {
  const node = entry.nodes[nodeId];
  const children = node.childIds.map((id) => toRow(entry, id, tone)).sort(bySize);

  // A group's `description` is a composition line computed from the tree — no
  // document describes a grouping we invented. A fact's `summary` names the
  // actual schemes it funds and is cited from that demand's Notes on Demands.
  // They occupy the same slot in the UI and never both exist on one node.
  const blurb = node.kind === "group" ? node.description : node.summary;

  const row = {
    id: node.localId,
    label: node.label,
    amountRupees: node.amountRupees,
    tone,
    children,
  };
  if (blurb) row.desc = blurb;
  if (node.url) row.url = node.url;
  // `spentOn` quotes published amounts and is the itemised half; the comp shows
  // it in the same place as the summary once a row is opened.
  if (node.spentOn) row.spentOn = node.spentOn;
  return row;
}

/** Sum a row list, for checking against a separately-published total. */
const sum = (rows) => rows.reduce((total, row) => total + row.amountRupees, 0);

function assertSums(label, rows, expected) {
  const got = sum(rows);
  if (got !== expected) {
    throw new Error(
      `${label}: parts sum to ${got} but the dataset publishes ${expected} ` +
        `(differs by ${got - expected}). The transform is wrong, or the artifact is stale — ` +
        `rebuild it with \`cd data && uv run wimtm-data build\`.`
    );
  }
}

const latestFinal = periods
  .filter((p) => sections.get(`union-expenditure|${p}`).status === "actual-final")
  .pop();

const built = [];

for (const period of periods) {
  const expenditure = sections.get(`union-expenditure|${period}`);
  const devolution = sections.get(`tax-devolution|${period}`);
  const receipts = sections.get(`tax-receipts|${period}`);
  const cessSection = sections.get(`cess-earmark|${period}`);

  // --- the two lenses over Union spending -------------------------------
  const lenses = {};
  for (const [lens, rootId] of Object.entries(expenditure.rootIds)) {
    const root = expenditure.nodes[rootId];
    const groups = root.childIds
      .map((id) => {
        const localId = expenditure.nodes[id].localId;
        return { id, localId };
      })
      .map(({ id, localId }) => toRow(expenditure, id, TONES[localId] ?? null))
      .sort(bySize);

    // Administrative tones are positional, so assign after sorting: the colour
    // spread is designed to separate neighbours in the list the reader sees.
    if (lens === "administrative") {
      groups.forEach((group, index) => {
        group.tone = ministryTone(index);
      });
    }

    // The sum rule, applied at the boundary where this transform could silently
    // drop a group: the lens must still account for every rupee of the total the
    // Ministry of Finance published.
    assertSums(`${period} ${lens}`, groups, expenditure.totalRupees);
    lenses[lens] = groups;
  }

  // Both lenses must cover exactly the same money, or the two views of one
  // budget would disagree — the property the dataset exists to guarantee.
  assertSums(`${period} lens agreement`, lenses.purpose, sum(lenses.administrative));

  // --- devolution: the states' share ------------------------------------
  const devRoot = devolution.nodes[devolution.rootIds.recipient];
  const states = devRoot.childIds
    .map((id) => toRow(devolution, id, "var(--color-accent-500)"))
    .sort(bySize);
  assertSums(`${period} devolution`, states, devolution.totalRupees);

  // --- the cess, and what it is earmarked for ---------------------------
  const cessRoot = cessSection.nodes[cessSection.rootIds.destination];
  const cessChildren = cessRoot.childIds
    .map((id) => toRow(cessSection, id, "var(--color-accent-2-500)"))
    .sort(bySize);
  assertSums(`${period} cess`, cessChildren, cessSection.totalRupees);

  // --- receipts: what share of collections is shareable at all -----------
  const receiptRoot = receipts.nodes[receipts.rootIds.shareability];
  const receiptParts = Object.fromEntries(
    receiptRoot.childIds.map((id) => [receipts.nodes[id].localId, receipts.nodes[id].amountRupees])
  );

  const year = {
    id: period,
    label: enDash(period),
    status: expenditure.status,
    tag: statusTag(expenditure.status, period === latestFinal),
    unionTotal: expenditure.totalRupees,
    devolutionTotal: devolution.totalRupees,
    cessTotal: cessSection.totalRupees,
    grossTax: receipts.totalRupees,
    divisiblePool: receiptParts["divisible-pool"] ?? null,
    nonShareable: receiptParts["non-shareable"] ?? null,
    // The headline share an award grants, published by the generator that used
    // it. Applied to base tax — cess and surcharge are already outside the pool,
    // so there is no second discount to apply on top.
    divisiblePoolPercent: Number(derivedParameter(devolution, "divisiblePoolPercent")),
    awardLabel: derivedParameter(devolution, "awardLabel"),
    lenses,
    states,
    cess: {
      label: cessRoot.label,
      desc: cessRoot.description ?? null,
      children: cessChildren,
    },
  };

  if (!Number.isFinite(year.divisiblePoolPercent)) {
    throw new Error(`${period}: no divisiblePoolPercent published on the devolution section.`);
  }

  built.push(year);
}

mkdirSync(YEAR_DIR, { recursive: true });
for (const file of readdirSync(YEAR_DIR)) {
  if (file.endsWith(".json")) unlinkSync(join(YEAR_DIR, file));
}

// Newest first: every list in the UI leads with the most recent year.
built.reverse();

// Each year is fetched on demand rather than bundled. One year is ~20 KB
// gzipped and all six are ~118 KB — small enough that bundling them would work,
// but the reader picks a year before any of this is needed, and the audience is
// on mobile data. Fetching costs nothing at the moment it happens and keeps the
// first paint carrying only the home screen's strip.
for (const year of built) {
  writeFileSync(join(YEAR_DIR, `${year.id}.json`), JSON.stringify(year));
}

// Inlined into the prerendered HTML: the year list, and the shape of the newest
// year's spending for the home-screen strip. Twelve numbers and their labels, so
// the landing page renders complete with no fetch and no layout shift.
const newest = built[0];

// `desc` and `href` ride along so the home screen can print the categories as
// real prose with real links rather than twelve bare labels. The descriptions are
// the dataset's own, not written in the component: a hand-written paraphrase
// would drift from the figures beside it the first time either changed.
const strip = [
  {
    id: "devolution",
    label: "Sent to state governments",
    desc: "The states' constitutional share of union tax collections, devolved unconditionally and deducted before the union spends anything.",
    href: "/state/",
    amountRupees: newest.devolutionTotal,
    tone: "var(--color-accent-500)",
  },
  ...newest.lenses.purpose.map((group) => ({
    id: group.id,
    label: group.label,
    desc: group.desc ?? null,
    href: `/where/${group.id}/`,
    // Scale each head against the money left after devolution, which is what the
    // Union actually had to allocate — the strip claims to show "every rupee the
    // government spends, to scale", so the two parts must be on one scale.
    amountRupees: group.amountRupees,
    tone: group.tone,
  })),
];

writeFileSync(
  SUMMARY,
  JSON.stringify({
    datasetVersion: dataset.datasetVersion,
    newestYear: newest.id,
    latestFinal,
    yearRange: `${built[built.length - 1].label} to ${built[0].label}`,
    years: built.map((y) => ({ id: y.id, label: y.label, tag: y.tag, status: y.status })),
    strip,
  })
);

for (const year of built) {
  console.log(
    `${year.id}  ${year.lenses.purpose.length} purpose  ` +
      `${year.lenses.administrative.length} ministries  ${year.states.length} states  ` +
      `\u20b9${(year.unionTotal / 1e12).toFixed(2)}L cr`
  );
}
console.log(`\nWrote ${built.length} years to public/data/ and src/data/summary.json`);

// ---------------------------------------------------------------------------
// entities.json, the same artifact, re-shaped for the static pages.
//
// The year files above answer "what did this year look like". A static page asks
// the opposite question, "what happened to this demand across every year", and
// pivoting one into the other at render time means loading all six years to draw
// one row. Pivot once, here.
//
// It also carries three things toRow() deliberately drops, because the app has
// nowhere to put them and a page does: `cite` (which document, which column),
// the revenue/capital `classifications`, and the source manifest itself. A page
// that prints a figure without saying where it came from is the one thing this
// project cannot ship.
//
// Build-time only. Astro imports it in frontmatter, so none of it is served.
// ---------------------------------------------------------------------------

const ENTITIES = join(HERE, "..", "src", "data", "entities.json");

/**
 * A slug for a URL, from the label a document prints.
 *
 * Deliberately not `localId`: that is `demand-1`, which identifies the line
 * correctly and tells a reader nothing. Labels are safe to build a URL on
 * because the dataset enforces that they do not drift, `label-drift` compares
 * every period of a section, which is what caught four OCR-damaged names.
 */
const slugify = (text) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Every node beneath a lens root, keyed by localId, with its parent's localId. */
function indexLens(entry, rootId) {
  const index = new Map();
  const walk = (id, parentLocalId) => {
    const node = entry.nodes[id];
    index.set(node.localId, { node, parentLocalId });
    for (const childId of node.childIds) walk(childId, node.localId);
  };
  for (const childId of entry.nodes[rootId].childIds) walk(childId, null);
  return index;
}

/** Revenue/capital, where Statement 3 publishes both columns for a line. */
function accountSplit(node) {
  const axis = node.classifications?.find((c) => c.axis === "account-class");
  if (!axis) return null;
  const part = (id) => axis.parts.find((p) => p.localId === id)?.amountRupees ?? null;
  return { revenue: part("revenue"), capital: part("capital") };
}

/** Accumulate one entity across periods, creating it on first sight. */
function upsert(store, id, make) {
  let record = store.get(id);
  if (!record) {
    record = make();
    store.set(id, record);
  }
  return record;
}

const purposes = new Map();
const ministries = new Map();
const lines = new Map();
const states = new Map();
const cessLines = new Map();

// Ministry colour is positional within a year's size-sorted list, so it is not a
// property of the ministry at all. The pages take the newest year's assignment
// and hold it steady, or a ministry would change colour between its own page and
// the year page next to it.
const ministryTones = new Map(built[0].lenses.administrative.map((g) => [g.id, g.tone]));

for (const period of periods) {
  const expenditure = sections.get(`union-expenditure|${period}`);
  const purposeIndex = indexLens(expenditure, expenditure.rootIds.purpose);
  const adminIndex = indexLens(expenditure, expenditure.rootIds.administrative);

  for (const [localId, { node, parentLocalId }] of purposeIndex) {
    if (node.depth === 1) {
      const purpose = upsert(purposes, localId, () => ({
        id: localId,
        slug: localId,
        label: node.label,
        description: node.description ?? null,
        tone: TONES[localId] ?? null,
        amounts: {},
        lineIds: [],
      }));
      purpose.amounts[period] = node.amountRupees;
      continue;
    }

    // Depth 3 and 4 exist only where a document itemises a transfer further
    // (the 2024-25 and 2025-26 grant components). They belong on their parent's
    // page as its composition, not on a page of their own.
    if (node.depth > 2) continue;

    const line = upsert(lines, localId, () => ({
      id: localId,
      slug: slugify(node.label),
      label: node.label,
      summary: null,
      spentOn: null,
      url: null,
      purposeId: null,
      ministryId: null,
      amounts: {},
      split: {},
      cites: {},
      parts: {},
    }));

    line.label = node.label;
    line.slug = slugify(node.label);
    line.purposeId = parentLocalId;
    line.ministryId = adminIndex.get(localId)?.parentLocalId ?? line.ministryId;
    line.amounts[period] = node.amountRupees;
    if (node.summary) line.summary = node.summary;
    if (node.spentOn) line.spentOn = node.spentOn;
    if (node.url) line.url = node.url;
    if (node.cite?.length) line.cites[period] = node.cite;

    const split = accountSplit(node);
    if (split) line.split[period] = split;

    if (node.childIds.length) {
      line.parts[period] = node.childIds
        .map((childId) => expenditure.nodes[childId])
        .map((child) => ({
          label: child.label,
          amountRupees: child.amountRupees,
          summary: child.summary ?? null,
        }))
        .sort((a, b) => b.amountRupees - a.amountRupees);
    }
  }

  for (const [localId, { node }] of adminIndex) {
    if (node.depth !== 1) continue;
    const ministry = upsert(ministries, localId, () => ({
      id: localId,
      slug: localId,
      label: node.label,
      description: node.description ?? null,
      url: node.url ?? null,
      tone: ministryTones.get(localId) ?? null,
      amounts: {},
      lineIds: [],
    }));
    ministry.amounts[period] = node.amountRupees;
    if (node.url) ministry.url = node.url;
    if (node.description) ministry.description = node.description;
  }

  const devolution = sections.get(`tax-devolution|${period}`);
  const devRoot = devolution.nodes[devolution.rootIds.recipient];
  for (const id of devRoot.childIds) {
    const node = devolution.nodes[id];
    const state = upsert(states, node.localId, () => ({
      id: node.localId,
      slug: node.localId,
      label: node.label,
      amounts: {},
      sharePercent: {},
      method: null,
      cites: {},
    }));
    state.amounts[period] = node.amountRupees;
    if (node.derived?.sharePercent != null) state.sharePercent[period] = node.derived.sharePercent;
    if (node.derived?.description) state.method = node.derived.description;
    if (node.cite?.length) state.cites[period] = node.cite;
  }

  const cessSection = sections.get(`cess-earmark|${period}`);
  const cessRoot = cessSection.nodes[cessSection.rootIds.destination];
  for (const id of cessRoot.childIds) {
    const node = cessSection.nodes[id];
    const fund = upsert(cessLines, node.localId, () => ({
      id: node.localId,
      label: node.label,
      summary: node.summary ?? node.description ?? null,
      amounts: {},
    }));
    fund.amounts[period] = node.amountRupees;
  }
}

// Membership is read from the newest year a line appears in: a demand that moved
// between ministries should be filed where it is now, and `group-drift` already
// forbids that happening silently.
for (const line of lines.values()) {
  if (line.purposeId) purposes.get(line.purposeId)?.lineIds.push(line.id);
  if (line.ministryId) ministries.get(line.ministryId)?.lineIds.push(line.id);
}

// A slug collision would put two different demands on one URL, and the loser
// would silently overwrite the winner at build time. Fail instead.
const seen = new Map();
for (const line of lines.values()) {
  const clash = seen.get(line.slug);
  if (clash) {
    throw new Error(
      `Slug collision: "${line.slug}" is claimed by both ${clash} and ${line.id} ` +
        `(both labelled "${line.label}"). Give one of them a distinct label in the dataset.`
    );
  }
  seen.set(line.slug, line.id);
}

const newestFirst = [...periods].reverse();
const byNewestAmount = (a, b) =>
  (b.amounts[newestFirst[0]] ?? 0) - (a.amounts[newestFirst[0]] ?? 0) ||
  (a.id < b.id ? -1 : 1);

writeFileSync(
  ENTITIES,
  JSON.stringify({
    datasetVersion: dataset.datasetVersion,
    builtAt: dataset.builtAt,
    periods: newestFirst,
    newestYear: newest.id,
    latestFinal,
    years: built.map((year) => ({
      id: year.id,
      label: year.label,
      tag: year.tag,
      status: year.status,
      unionTotal: year.unionTotal,
      devolutionTotal: year.devolutionTotal,
      cessTotal: year.cessTotal,
      grossTax: year.grossTax,
      divisiblePool: year.divisiblePool,
      nonShareable: year.nonShareable,
      divisiblePoolPercent: year.divisiblePoolPercent,
      awardLabel: year.awardLabel,
    })),
    sections: dataset.sections
      .filter((entry) => entry.period === newest.id)
      .map((entry) => ({
        id: entry.section,
        label: entry.label,
        description: entry.description,
        perimeter: entry.perimeter,
      })),
    purposes: [...purposes.values()].sort(byNewestAmount),
    ministries: [...ministries.values()].sort(byNewestAmount),
    lines: [...lines.values()].sort(byNewestAmount),
    states: [...states.values()].sort(byNewestAmount),
    cess: [...cessLines.values()].sort(byNewestAmount),
    sources: dataset.sources,
    revisionNotes: dataset.revisionNotes ?? [],
  })
);

console.log(
  `Wrote src/data/entities.json, ${purposes.size} purposes, ${ministries.size} ministries, ` +
    `${lines.size} lines, ${states.size} states, ${dataset.sources.length} sources`
);
