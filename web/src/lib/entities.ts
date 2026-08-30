// Typed access to src/data/entities.json, which scripts/build-data.mjs pivots out
// of the committed dataset artifact.
//
// Build-time only. Every consumer is Astro frontmatter, so none of this reaches
// the browser, which is why it can afford to carry the citation and source
// manifest the runtime year files leave out.

import raw from "../data/entities.json";

export interface Cite {
  sourceId: string;
  locator: string;
}

/** Rupee figures keyed by period ("2024-25"). A period may be absent. */
export type Amounts = Record<string, number>;

export interface Purpose {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  tone: string | null;
  amounts: Amounts;
  lineIds: string[];
}

export interface Ministry {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  url: string | null;
  tone: string | null;
  amounts: Amounts;
  lineIds: string[];
}

export interface AccountSplit {
  revenue: number | null;
  capital: number | null;
}

export interface LinePart {
  label: string;
  amountRupees: number;
  summary: string | null;
}

export interface Line {
  id: string;
  slug: string;
  label: string;
  summary: string | null;
  spentOn: string | null;
  url: string | null;
  purposeId: string | null;
  ministryId: string | null;
  amounts: Amounts;
  split: Record<string, AccountSplit>;
  cites: Record<string, Cite[]>;
  parts: Record<string, LinePart[]>;
}

export interface StateShare {
  id: string;
  slug: string;
  label: string;
  amounts: Amounts;
  sharePercent: Record<string, number>;
  method: string | null;
  cites: Record<string, Cite[]>;
}

export interface CessFund {
  id: string;
  label: string;
  summary: string | null;
  amounts: Amounts;
}

export interface SourceDoc {
  id: string;
  publisher: string;
  documentTitle: string;
  canonicalUrl: string;
  period: string;
  status: string;
  documentKind: string;
  unit: string;
  retrievedAt: string;
  file?: string;
  checksumSha256?: string;
  verification?: string;
  notes?: string;
}

export interface YearMeta {
  id: string;
  label: string;
  tag: string;
  status: string;
  unionTotal: number;
  devolutionTotal: number;
  cessTotal: number;
  grossTax: number;
  divisiblePool: number | null;
  nonShareable: number | null;
  divisiblePoolPercent: number;
  awardLabel: string | null;
}

export interface SectionMeta {
  id: string;
  label: string;
  description: string;
  perimeter: string;
}

export interface Entities {
  datasetVersion: string;
  builtAt: string;
  /** Newest first. */
  periods: string[];
  newestYear: string;
  latestFinal: string;
  years: YearMeta[];
  sections: SectionMeta[];
  purposes: Purpose[];
  ministries: Ministry[];
  lines: Line[];
  states: StateShare[];
  cess: CessFund[];
  sources: SourceDoc[];
  revisionNotes: { period?: string; note?: string; [key: string]: unknown }[];
}

export const entities = raw as unknown as Entities;

/** "2024-25" → "2024–25". The dataset uses a hyphen; the design uses an en dash. */
export const enDash = (period: string): string => period.replace("-", "–");

const index = <T extends { id: string }>(rows: T[]): Map<string, T> =>
  new Map(rows.map((row) => [row.id, row]));

export const purposeById = index(entities.purposes);
export const ministryById = index(entities.ministries);
export const lineById = index(entities.lines);
export const sourceById = index(entities.sources);
export const yearById = index(entities.years);

/** The lines belonging to a purpose or ministry, biggest in the newest year first. */
export function linesOf(ids: string[]): Line[] {
  return ids
    .map((id) => lineById.get(id))
    .filter((line): line is Line => Boolean(line))
    .sort((a, b) => amountIn(b, entities.newestYear) - amountIn(a, entities.newestYear));
}

/** A figure for one period, or 0 where the entity does not appear that year. */
export const amountIn = (row: { amounts: Amounts }, period: string): number =>
  row.amounts[period] ?? 0;

/** The most recent period an entity carries a figure for. */
export function newestPeriodOf(row: { amounts: Amounts }): string {
  return entities.periods.find((period) => row.amounts[period] != null) ?? entities.newestYear;
}

/**
 * The citation for a figure, resolved to the document it came from.
 *
 * Every published figure on this site can name the PDF it was read out of, the
 * column it sat in, and the SHA-256 of the file. That is the whole argument for
 * trusting the site, so a page that prints a number prints this next to it.
 */
export function citationsFor(cites: Cite[] | undefined): { cite: Cite; source: SourceDoc }[] {
  if (!cites) return [];
  return cites
    .map((cite) => ({ cite, source: sourceById.get(cite.sourceId) }))
    .filter((pair): pair is { cite: Cite; source: SourceDoc } => Boolean(pair.source));
}
