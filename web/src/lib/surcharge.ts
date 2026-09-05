// Guessing the surcharge from the amount the reader typed.
//
// Surcharge is charged on total income, not on tax paid, which is why the input
// screen has to ask. But the two are not independent. There is a smallest
// possible tax bill for an income of ₹50 lakh, and anyone who paid more than
// that had more than ₹50 lakh of income, whatever their deductions were. Above
// the line, a surcharge was charged. That is not a guess, it is arithmetic.
//
// So for each threshold we work out the tax due at exactly that income under
// both regimes, take the larger of the two, and only offer the rate once the
// reader's own figure clears it. What comes back therefore holds whichever
// regime they filed under, which is the one thing about them we cannot know.
//
// Two deliberate limits:
//
//   - It never suggests 37%. That rate exists only in the old regime; the new
//     one, which is now the default, stops at 25%. Above ₹2 crore of income the
//     two regimes disagree and there is nothing in a tax total that settles it,
//     so the answer stays at the rate both agree on. Someone on the old regime
//     above ₹5 crore has to move it up a step themselves.
//   - It is a starting point, not an answer. The reader's own choice always
//     wins, and once they touch the buttons this stops being consulted.
//
// Kept out of allocate.ts on purpose. That file is a port of scripts/allocate.py
// and the fixtures assert the two agree line for line; this is an estimate about
// the reader rather than a step in the allocation, and mixing them would put
// something in the audited half that has no source document behind it.

import { HEALTH_EDUCATION_CESS } from "./allocate";

/** A slab table as [upper edge of the band, rate]. The last band is open-ended. */
type Slabs = [limit: number, rate: number][];

/**
 * Old regime, resident individual under 60. Unchanged across every year the
 * site covers. A senior citizen's higher exemption only lowers this, and we
 * want the higher of the two regimes, so the ordinary table is the safe one.
 */
const OLD_REGIME: Slabs = [
  [250_000, 0],
  [500_000, 0.05],
  [1_000_000, 0.2],
  [Number.POSITIVE_INFINITY, 0.3],
];

/**
 * New regime (section 115BAC) as it stands for FY 2024-25. The earlier years'
 * tables differ below ₹15 lakh, but every threshold here sits far above that,
 * where all of them charge a flat 30%, so the boundary moves by too little to
 * matter against the deductions we cannot see anyway.
 */
const NEW_REGIME: Slabs = [
  [300_000, 0],
  [700_000, 0.05],
  [1_000_000, 0.1],
  [1_200_000, 0.15],
  [1_500_000, 0.2],
  [Number.POSITIVE_INFINITY, 0.3],
];

function slabTax(income: number, slabs: Slabs): number {
  let tax = 0;
  let floor = 0;
  for (const [limit, rate] of slabs) {
    if (income <= floor) break;
    tax += (Math.min(income, limit) - floor) * rate;
    floor = limit;
  }
  return tax;
}

/**
 * What someone sitting exactly on a threshold pays in total, cess included.
 *
 * Rounded to the rupee because the comparison below is a strict one and the
 * multiplication lands a fraction either side of a whole number: unrounded, the
 * ₹2 crore threshold came out a hair under ₹69,51,750 and a reader who paid
 * exactly that was pushed up a band by nothing but binary floating point.
 */
function billAt(income: number, surchargeInForce: number): number {
  const base = Math.max(slabTax(income, OLD_REGIME), slabTax(income, NEW_REGIME));
  return Math.round(base * (1 + surchargeInForce) * (1 + HEALTH_EDUCATION_CESS));
}

/**
 * Where each rate starts. `label` is how the threshold is written on screen;
 * `income` is the same figure, and the two must not drift apart.
 */
const BANDS = [
  { income: 5_000_000, rate: 0.1, label: "₹50 lakh" },
  { income: 10_000_000, rate: 0.15, label: "₹1 crore" },
  { income: 20_000_000, rate: 0.25, label: "₹2 crore" },
] as const;

/**
 * Each band, with the smallest tax total that can only have come from an income
 * above it. The surcharge already in force at a threshold is the band below's,
 * because the higher rate applies above the line rather than at it.
 */
const LADDER = BANDS.map((band, i) => ({
  rate: band.rate,
  label: band.label,
  minPaid: billAt(band.income, i === 0 ? 0 : BANDS[i - 1].rate),
}));

export interface SurchargeGuess {
  /** One of the values in SURCHARGE_RATES. */
  rate: number;
  /** The income threshold this amount clears, for the line that explains it. */
  incomeLabel: string;
}

/**
 * The surcharge a tax total implies, or null when it implies none. Null is not
 * the same as zero here: it means there is nothing worth telling the reader.
 */
export function guessSurcharge(totalPaid: number): SurchargeGuess | null {
  let found: SurchargeGuess | null = null;
  for (const band of LADDER) {
    if (totalPaid > band.minPaid) found = { rate: band.rate, incomeLabel: band.label };
  }
  return found;
}
