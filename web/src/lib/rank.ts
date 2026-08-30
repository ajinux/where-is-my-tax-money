// "Your badge" — where a reader's own payment sits against everyone else's,
// grounded in real filing figures rather than an invented curve.
//
// There is no published table of "income tax paid, by percentile" — nobody
// releases that. What exists is the Ministry of Finance's answer to Rajya
// Sabha Unstarred Question No. 2478 (17 Dec 2024): individual ITR filers for
// AY 2023-24, by range of total income — the most granular official
// breakdown available. Applying that year's own slab rates (FY 2022-23: the
// last year the old regime — ₹2.5L exempt, 5% to ₹5L, 20% to ₹10L, 30% above,
// 4% cess, full Section 87A rebate up to ₹5L taxable income — was still what
// most filers used) to each band's upper edge splits the 79.8 million filers
// into those who owed nothing and those who owed something: 23.5 million
// people actually paid.
//
// Against that: the Election Commission's own count of registered voters for
// the 2024 general election, 96.9 crore — an official, adults-only figure,
// not a share of the total population guessed from an age pyramid.
//
// 23.5 million against 96.9 crore adults is about 2.4%. ADULT_SHARE below is
// that number; PAYER_CURVE is each real income band's upper edge, as
// approximate tax paid, against what percentile of *payers* — not of all
// adults — that band sits at. rank() does the second scaling itself, so the
// number that ever reaches the screen is always a rank among adults.

export interface Badge {
  name: string;
  tone: string;
  tint: string;
  ink: string;
  note: string;
}

export interface Rank {
  topText: string;
  oneIn: string;
  badge: Badge;
}

/** Tax paid (₹) → percentile among people who paid something, not among all filers. */
const PAYER_CURVE: [tax: number, percentile: number][] = [
  [1, 0],
  [23_000, 10.5],
  [107_000, 54.5],
  [117_000, 57.5],
  [273_000, 76.0],
  [429_000, 84.5],
  [585_000, 89.0],
  [1_365_000, 96.0],
  [2_925_000, 98.5],
  [15_405_000, 99.9],
  [31_000_000, 100],
];

/** Share of India's adults (Election Commission electorate, 2024) who pay any income tax. */
const ADULT_SHARE = 2.4;

// Same five tiers as the design, at percentile-among-payers breakpoints chosen
// because they land on round shares of adults once ADULT_SHARE is applied:
// 0 → 2.4%, 50 → 1.2%, 80 → 0.48%, 95 → 0.12%, 99 → 0.024%.
const BADGES: { min: number; badge: Badge }[] = [
  {
    min: 0,
    badge: {
      name: "Quiet contributor",
      tone: "var(--color-accent-2)",
      tint: "var(--color-accent-2-200)",
      ink: "var(--color-accent-2-900)",
      note: "Almost nobody in India pays income tax. You do. That is your money in the list above, and you are owed a straight answer about every line of it.",
    },
  },
  {
    min: 50,
    badge: {
      name: "Steady hand",
      tone: "var(--color-accent-2)",
      tint: "var(--color-accent-2-200)",
      ink: "var(--color-accent-2-900)",
      note: "You carry more than the overwhelming majority of people around you ever will. That earns you the right to ask hard questions about where it lands.",
    },
  },
  {
    min: 80,
    badge: {
      name: "Heavy lifter",
      tone: "var(--color-accent)",
      tint: "var(--color-accent-200)",
      ink: "var(--color-accent-900)",
      note: "A very small number of people fund a very large share of this. You are one of them, whatever you think of how well it gets spent.",
    },
  },
  {
    min: 95,
    badge: {
      name: "Rare company",
      tone: "var(--color-accent)",
      tint: "var(--color-accent-200)",
      ink: "var(--color-accent-900)",
      note: "Your one receipt does the work of dozens. Nobody sent you a thank-you note for it, so here is one, and here is the list you never got.",
    },
  },
  {
    min: 99,
    badge: {
      name: "Top of the table",
      tone: "var(--color-accent)",
      tint: "var(--color-accent-300)",
      ink: "var(--color-accent-900)",
      note: "You sit at the very top of the tax rolls. The scrutiny you apply to every rupee above is entirely earned.",
    },
  },
];

function payerPercentile(tax: number): number {
  if (tax <= PAYER_CURVE[0][0]) return PAYER_CURVE[0][1];
  for (let i = 1; i < PAYER_CURVE.length; i++) {
    const [x0, y0] = PAYER_CURVE[i - 1];
    const [x1, y1] = PAYER_CURVE[i];
    if (tax <= x1) {
      const t = (Math.log(tax) - Math.log(x0)) / (Math.log(x1) - Math.log(x0));
      return y0 + t * (y1 - y0);
    }
  }
  return 100;
}

export function rank(amountPaid: number): Rank {
  const pct = Math.max(0, Math.min(100, payerPercentile(amountPaid)));
  const badge = BADGES.slice().reverse().find((b) => pct >= b.min)!.badge;

  const top = Math.max(0.01, ADULT_SHARE * (1 - pct / 100));
  const oneIn = Math.round(100 / top);

  return {
    topText: `${top < 1 ? top.toFixed(2) : top.toFixed(1)}%`,
    oneIn: oneIn.toLocaleString("en-IN"),
    badge,
  };
}
