// The URL is the share. Everything a reader can point someone at — the amount,
// the year, which lens, how deep, and which row — lives in the query string, and
// these two functions are the whole contract between an address and a screen.
//
// They live here rather than inside App because App's copies touched `window` on
// every path, which made the most breakable part of the feature the only part
// that could not be tested. Both are pure; App supplies `window.location.search`
// and the origin.

import type { LensName, Summary } from "./model";
import { parseAmount } from "./format";

/** The part of App's state that a link carries. */
export interface LinkState {
  amount: number;
  surcharge: number;
  year: string;
  lens: LensName;
  /** Which head is open, or null for the result screen. */
  headId: string | null;
  /** Which child of that head was drilled into. Written by "Go deeper" only. */
  subIndex: number | null;
  /** Which row on the current list a shared link points at. */
  focusId: string | null;
}

/** Overrides for a link that points somewhere other than where the reader is. */
export interface LinkTarget {
  headId?: string | null;
  subIndex?: number | null;
  focusId?: string | null;
}

const LENS_PARAM: Record<string, LensName> = { purpose: "purpose", who: "administrative" };

/**
 * Read a link. Returns null when there is no amount in it, which is every URL
 * that is not a share — there is nothing to show without one.
 */
export function parseLink(search: string, summary: Summary): (LinkState & { screen: "result" | "detail"; amountStr: string }) | null {
  const q = new URLSearchParams(search);
  const paid = parseAmount(q.get("paid") ?? "");
  if (paid <= 0) return null;

  const fy = summary.years.some((y) => y.id === q.get("fy")) ? q.get("fy")! : summary.latestFinal;
  const at = q.get("at");
  const sub = Number.parseInt(q.get("sub") ?? "", 10);

  return {
    amount: paid,
    amountStr: paid.toLocaleString("en-IN"),
    surcharge: Number.parseFloat(q.get("sur") ?? "0") || 0,
    year: fy,
    lens: LENS_PARAM[q.get("lens") ?? "purpose"] ?? "purpose",
    // `at` and `row` are validated against the loaded year rather than here — its
    // figures have not arrived at this point, and a stale or renamed id should
    // land quietly at the top rather than error.
    screen: at ? "detail" : "result",
    headId: at,
    subIndex: Number.isNaN(sub) ? null : sub,
    focusId: q.get("row"),
  };
}

/**
 * Write a link, as a query string with its leading `?`. An override of `null`
 * clears that parameter; omitting it keeps whatever the reader is looking at.
 */
export function linkQuery(state: LinkState, target: LinkTarget = {}): string {
  const q = new URLSearchParams();
  q.set("paid", String(state.amount));
  if (state.surcharge) q.set("sur", String(state.surcharge));
  q.set("fy", state.year);
  if (state.lens !== "purpose") q.set("lens", "who");

  const head = target.headId === undefined ? state.headId : target.headId;
  if (head) q.set("at", head);

  const sub = target.subIndex === undefined ? state.subIndex : target.subIndex;
  if (sub !== null && sub !== undefined) q.set("sub", String(sub));

  const focus = target.focusId === undefined ? state.focusId : target.focusId;
  if (focus) q.set("row", focus);

  return `?${q}`;
}
