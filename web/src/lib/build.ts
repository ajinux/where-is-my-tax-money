// The view model behind every screen — a port of the comp's `build()`.
//
// Where the comp computed a row's national figure by multiplying hand-written
// percentages, the real tree carries the published amount on every node, so these
// are read rather than derived. The reader's own share is apportioned level by
// level (see allocateRows), which is what makes the subtotals on screen add up.

import { allocateRows, route, type Allocated, type Route, type Row } from "./allocate";
import { formatCroreShort, formatInr, percentOf } from "./format";
import type { LensName, YearData } from "./model";

export interface DisplayRow {
  id: string;
  label: string;
  /** The reader's share, formatted. */
  amount: string;
  /** The reader's share, in rupees. */
  yours: number;
  /** Share of everything they paid. */
  percentText: string;
  /** What the country spent on this, formatted compactly. */
  national: string;
  tone: string;
  /** Bar width as a CSS percentage, scaled against the largest row. */
  barWidth: string;
  desc?: string;
  spentOn?: string;
  url?: string;
  hasChildren: boolean;
}

export interface HeadView {
  id: string;
  label: string;
  tone: string;
  amount: string;
  percentText: string;
  national: string;
  /** Width of the "share of everything" bar. */
  bar: string;
  note: string;
  aside?: string;
  url?: string;
  urlLabel?: string;
  insideLabel: string;
  parentLabel?: string;
}

export interface ShareCard {
  kicker: string;
  big: string;
  sub: string;
  lines: { label: string; amount: string }[];
}

export interface BuildInput {
  year: YearData;
  amount: number;
  surcharge: number;
  lens: LensName;
  headId: string | null;
  subIndex: number | null;
}

export interface Built {
  split: Route;
  /** State devolution first, then the Union's spending heads. */
  rows: DisplayRow[];
  hero: DisplayRow;
  strip: { width: string; tone: string; id: string }[];
  /** Caption under the strip. It names whatever the strip is currently scaled to. */
  stripLabel: string;
  head: HeadView | null;
  inside: DisplayRow[];
  card: ShareCard;
  parts: { label: string; amount: string; opens?: "cess" }[];
}

const DEVOLUTION_ID = "devolution";
const CESS_ID = "cess";
const ACCENT = "var(--color-accent-500)";

/** Bars never vanish entirely: a 3% floor keeps the smallest row legible. */
function barWidth(value: number, max: number): string {
  if (max <= 0) return "3%";
  return `${Math.max(3, (value / max) * 100)}%`;
}

function toDisplay(
  row: Allocated,
  total: number,
  max: number,
  fallbackTone: string
): DisplayRow {
  return {
    id: row.id,
    label: row.label,
    amount: formatInr(row.yours),
    yours: row.yours,
    percentText: percentOf(row.yours, total),
    national: formatCroreShort(row.amountRupees),
    tone: row.tone ?? fallbackTone,
    barWidth: barWidth(row.yours, max),
    desc: row.desc,
    spentOn: row.spentOn,
    url: row.url,
    hasChildren: row.children.length > 0,
  };
}

/** Allocate a list of rows and format them together, sharing one bar scale. */
function displayList(rows: Row[], pot: number, total: number, fallbackTone: string): {
  allocated: Allocated[];
  display: DisplayRow[];
} {
  const allocated = allocateRows(rows, pot);
  const max = allocated.reduce((m, r) => Math.max(m, r.yours), 0);
  return {
    allocated,
    display: allocated.map((r) => toDisplay(r, total, max, fallbackTone)),
  };
}

export function build(input: BuildInput): Built {
  const { year, amount, surcharge, lens, headId, subIndex } = input;
  const split = route(amount, surcharge, year.divisiblePoolPercent);
  const total = amount;

  // --- the top-level list ------------------------------------------------
  //
  // The dataset keeps devolution outside the expenditure perimeter on purpose —
  // it is deducted from receipts before the Union spends anything, so the two
  // totals are not comparable. For a taxpayer the question is one question, so
  // the states' share sits alongside defence and interest here. That merge is a
  // display decision and lives only in the UI.
  const union = displayList(year.lenses[lens], split.toUnion, total, ACCENT);

  const devolutionRow: DisplayRow = {
    id: DEVOLUTION_ID,
    label: "Sent to state governments",
    amount: formatInr(split.toStates),
    yours: split.toStates,
    percentText: percentOf(split.toStates, total),
    national: formatCroreShort(year.devolutionTotal),
    tone: ACCENT,
    barWidth: "100%",
    hasChildren: true,
  };

  const rows = [devolutionRow, ...union.display].sort((a, b) => b.yours - a.yours);
  const max = rows.reduce((m, r) => Math.max(m, r.yours), 0);
  for (const row of rows) row.barWidth = barWidth(row.yours, max);

  // The strip is built from its own array, not from `rows`.
  //
  // `rows` is the spending list — devolution plus the Union's heads — and cess is
  // deliberately absent from it, because cess is earmarked financing and the
  // dataset forbids summing that perimeter with union spending. The strip makes a
  // different claim: "your whole tax, to scale". So it has to include the cess, or
  // it describes 96% of the bill while calling it all of it. Adding cess here and
  // nowhere else keeps both statements true, and is what lets the cess view
  // highlight a block of its own instead of rendering every block grey.
  let strip = [
    ...rows.map((row) => ({ id: row.id, yours: row.yours, tone: row.tone })),
    { id: CESS_ID, yours: split.toCess, tone: "var(--color-accent-2-500)" },
  ]
    .sort((a, b) => b.yours - a.yours)
    .map((row) => ({
      id: row.id,
      width: `${total ? (row.yours / total) * 100 : 0}%`,
      tone: row.id === headId ? row.tone : "var(--color-neutral-300)",
    }));
  let stripLabel =
    "Your whole tax, split into blocks. The coloured one is what you are looking at.";

  // --- whatever is open below the list -----------------------------------
  let head: HeadView | null = null;
  let inside: DisplayRow[] = [];
  // Carried alongside `inside` so the one-level-deeper drill below can reach the
  // children of whichever row was opened — whatever kind of head produced it.
  let insideRows: Allocated[] = [];

  if (headId === DEVOLUTION_ID) {
    const states = displayList(year.states, split.toStates, total, ACCENT);
    head = {
      id: DEVOLUTION_ID,
      label: devolutionRow.label,
      tone: ACCENT,
      amount: devolutionRow.amount,
      percentText: percentOf(split.toStates, total),
      national: formatCroreShort(year.devolutionTotal),
      bar: percentOf(split.toStates, total),
      note:
        "The Constitution guarantees states a share of the tax the centre collects. " +
        "It is taken out first, before the centre spends anything, and states can use " +
        "it however they choose.",
      // The gap between the headline and the reality belongs here and nowhere
      // else on the page: it is the answer to "why not 41%".
      aside:
        `You may have heard that states get ${year.divisiblePoolPercent}%. That ` +
        `${year.divisiblePoolPercent}% is of a smaller amount, not of what you paid, because ` +
        `your cess and surcharge are kept out of it. What your state actually receives is ` +
        `${split.effectiveStatePercent.toFixed(1)}% of your money.`,
      insideLabel: "How this is split between states",
      url: "https://fincomindia.nic.in",
      urlLabel: "Who decides the split",
    };
    inside = states.display;
    insideRows = states.allocated;
  } else if (headId === CESS_ID) {
    const cess = displayList(year.cess.children, split.toCess, total, "var(--color-accent-2-500)");
    head = {
      id: CESS_ID,
      label: year.cess.label,
      tone: "var(--color-accent-2-500)",
      amount: formatInr(split.toCess),
      percentText: percentOf(split.toCess, total),
      national: formatCroreShort(year.cessTotal),
      bar: percentOf(split.toCess, total),
      note:
        "A flat 4% added on top of your tax, paid by everyone whatever they earn. The law " +
        "fixes what it can be spent on",
      aside:
        "This money is locked to one purpose and cannot be moved elsewhere, and unlike " +
        "ordinary tax, none of it is passed to your state directly.",
      insideLabel: "What the cess pays for",
    };
    inside = cess.display;
    insideRows = cess.allocated;
  } else if (headId) {
    const index = year.lenses[lens].findIndex((row) => row.id === headId);
    if (index >= 0) {
      const group = union.allocated[index];
      const groupRow = union.display[index];
      const children = displayList(group.children, group.yours, total, groupRow.tone);
      head = {
        id: group.id,
        label: group.label,
        tone: groupRow.tone,
        amount: groupRow.amount,
        percentText: percentOf(group.yours, total),
        national: formatCroreShort(group.amountRupees),
        bar: percentOf(group.yours, total),
        note: group.desc ?? "",
        url: group.url,
        urlLabel: lens === "administrative" ? "Official ministry website" : undefined,
        insideLabel: "What this pays for",
      };
      inside = children.display;
      insideRows = children.allocated;

    }
  }

  // One level further down, when the row we are on has children of its own.
  //
  // This deliberately sits *outside* the branch above. It used to live inside the
  // spending-head case, which meant `?at=cess&sub=1` rendered the cess head over
  // and over: the fund's "Go deeper" button appeared, set subIndex, changed the
  // URL — and nothing else moved, because nothing here was reading it. The cess
  // tree is two levels deep (fund, then the schemes it pays for), so it needs the
  // same drill a ministry does.
  //
  // The children check guards the other direction: states are leaves, so a
  // hand-edited `&sub=` on the devolution view must not replace the head with a
  // state carrying an empty list underneath it.
  if (head && subIndex !== null && insideRows[subIndex]?.children.length) {
    const parent = head;
    const item = insideRows[subIndex];
    const itemRow = inside[subIndex];
    const grandchildren = displayList(item.children, item.yours, total, parent.tone);
    head = {
      id: `${parent.id}:${item.id}`,
      label: item.label,
      tone: parent.tone,
      amount: itemRow.amount,
      percentText: percentOf(item.yours, total),
      national: formatCroreShort(item.amountRupees),
      bar: percentOf(item.yours, total),
      // `spentOn` itemises what a head actually buys and is the better note once
      // you are looking at that head alone; `desc` is the one-line summary the
      // row above already showed.
      note: item.spentOn ?? item.desc ?? "",
      insideLabel: "What this pays for",
      parentLabel: parent.label,
    };
    // Rescale the strip to this level, before `inside` is overwritten below: the
    // blocks should compare the row you opened against its own siblings, not
    // against the top-level heads it is nested inside. On the top-level scale the
    // coloured block would be the ancestor rather than the thing you clicked.
    const parentTotal = inside.reduce((sum, row) => sum + row.yours, 0);
    strip = inside.map((row, index) => ({
      id: row.id,
      width: `${parentTotal ? (row.yours / parentTotal) * 100 : 0}%`,
      tone: index === subIndex ? parent.tone : "var(--color-neutral-300)",
    }));
    stripLabel = `Inside ${parent.label}, split into blocks. The coloured one is what you are looking at.`;

    inside = grandchildren.display;
    insideRows = grandchildren.allocated;
  }

  // --- the shareable summary ---------------------------------------------
  const hero = rows[0];
  const card: ShareCard = head
    ? {
        kicker: head.label,
        big: head.amount,
        sub: `of my income tax went here, ${head.percentText} of everything I paid.${
          inside.length ? " Inside it:" : ""
        }`,
        lines: inside.slice(0, 3).map((row) => ({ label: row.label, amount: row.amount })),
      }
    : {
        kicker: `I paid ${formatInr(total)} in income tax`,
        big: hero.amount,
        sub: `of it went to ${hero.label.charAt(0).toLowerCase()}${hero.label.slice(
          1
        )}. The rest went like this:`,
        lines: rows.slice(1, 4).map((row) => ({ label: row.label, amount: row.amount })),
      };

  return {
    split,
    rows,
    hero,
    strip,
    stripLabel,
    head,
    inside,
    card,
    parts: [
      { label: "Your actual tax - part of which goes to your state", amount: formatInr(split.base) },
      { label: "Cess - locked to one purpose, kept by the centre", amount: formatInr(split.cess), opens: "cess" },
      { label: "Surcharge - kept entirely by the centre", amount: formatInr(split.surcharge) },
    ],
  };
}
