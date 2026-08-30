// The shape scripts/build-data.mjs emits. Kept beside the transform rather than
// inferred from it, because the transform runs in plain Node at build time and
// has no types of its own.

import type { Row } from "./allocate";

export type LensName = "purpose" | "administrative";

export interface YearData {
  id: string;
  /** "2024–25", with the en dash the design uses. */
  label: string;
  status: "actual-final" | "revised-estimate" | string;
  /** How settled these figures are, shown under the year. */
  tag: string;
  unionTotal: number;
  devolutionTotal: number;
  cessTotal: number;
  grossTax: number;
  divisiblePool: number | null;
  nonShareable: number | null;
  /** The headline share an award grants, applied to base tax. */
  divisiblePoolPercent: number;
  awardLabel: string | null;
  lenses: Record<LensName, Row[]>;
  states: Row[];
  cess: { label: string; desc: string | null; children: Row[] };
}

export interface YearStub {
  id: string;
  label: string;
  tag: string;
  status: string;
}

export interface Summary {
  datasetVersion: string;
  newestYear: string;
  /**
   * The newest year whose expenditure is settled actuals, which is what the year
   * picker opens on. `newestYear` is one year further ahead and is a revised
   * estimate: nobody has paid a full year of tax under it yet, so defaulting
   * there would ask a reader for a figure that does not exist.
   */
  latestFinal: string;
  yearRange: string;
  years: YearStub[];
  strip: {
    id: string;
    label: string;
    /** The dataset's own one-line description of the category. */
    desc: string | null;
    /** The reference page for this category, for the crawlable list on the home screen. */
    href: string;
    amountRupees: number;
    tone: string;
  }[];
}

const cache = new Map<string, Promise<YearData>>();

/**
 * Fetch one year, once. Years are static files under /data/ rather than bundled:
 * the reader picks a year before any of it is needed, so the fetch costs nothing
 * at the moment it happens, and the first paint stays small on mobile data.
 */
export function loadYear(id: string, base = ""): Promise<YearData> {
  const existing = cache.get(id);
  if (existing) return existing;

  const pending = fetch(`${base}/data/${id}.json`).then((response) => {
    if (!response.ok) {
      cache.delete(id); // a failed fetch must not be cached as the answer
      throw new Error(`Could not load figures for ${id} (${response.status})`);
    }
    return response.json() as Promise<YearData>;
  });

  cache.set(id, pending);
  return pending;
}
