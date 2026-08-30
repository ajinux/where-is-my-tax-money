// Number formatting for an Indian reader. Ported from the prototype that
// preceded this site; the maths it was lifted from now lives in scripts/allocate.py.

/**
 * Group digits the Indian way: last three, then pairs. 1286885 -> 12,86,885.
 *
 * `toLocaleString("en-IN")` does this correctly in every browser that matters,
 * but it is also used here on strings that are already rounded and split, and a
 * locale that silently falls back to the Western grouping would be wrong in a way
 * nobody would notice in review. Doing it explicitly costs six lines.
 */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  let head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  const parts: string[] = [];
  while (head.length > 2) {
    parts.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head) parts.unshift(head);
  return `${parts.join(",")},${tail}`;
}

/** Format whole rupees: ₹1,20,000. */
export function formatInr(rupees: number): string {
  const out = `₹${groupIndian(String(Math.abs(Math.round(rupees))))}`;
  return rupees < 0 ? `-${out}` : out;
}

/** Big published totals read better in crore than in full rupees. */
export function formatCrore(rupees: number): string {
  const crore = rupees / 10_000_000;
  if (crore >= 100) return `₹${groupIndian(crore.toFixed(0))} crore`;
  const [whole, frac] = crore.toFixed(2).split(".");
  return `₹${groupIndian(whole)}.${frac} crore`;
}

/**
 * The compact form used beside every row — "₹4.96 lakh cr", "₹87,000 cr".
 *
 * These sit under a figure in the reader's own rupees, where the job is to give
 * a sense of national scale, not a precise total. Rounding hard is the point.
 */
export function formatCroreShort(rupees: number): string {
  const crore = rupees / 10_000_000;
  if (crore >= 100_000) {
    const lakhCrore = crore / 100_000;
    return `₹${lakhCrore.toFixed(crore >= 1_000_000 ? 1 : 2)} lakh cr`;
  }
  if (crore >= 1_000) return `₹${groupIndian(String(Math.round(crore / 1_000) * 1_000))} cr`;
  return `₹${groupIndian(String(Math.round(crore)))} cr`;
}

/** Read a rupee figure out of whatever the reader typed. */
export function parseAmount(raw: string): number {
  const digits = String(raw).replace(/[^0-9]/g, "");
  if (!digits) return 0;
  const n = Number.parseInt(digits, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** One decimal place, as a share of the whole tax bill. */
export function percentOf(part: number, whole: number): string {
  if (!whole) return "0.0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}
