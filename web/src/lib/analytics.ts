// GoatCounter, wrapped so the rest of the app never touches `window`.
//
// Two things are separated on purpose. The **pageview** records a clean
// `location.pathname`, set in Base.astro, so the top-pages report compares "/"
// against the reference pages instead of fragmenting into one row per query
// string. Anything else worth knowing is sent as an **event**, which GoatCounter
// keeps in its own namespace.
//
// Every call is a no-op when the script has not loaded, was blocked, or is
// running server-side during the Astro build. Analytics must never be able to
// break a screen.

interface GoatCounter {
  count?: (vars: { path: string; title?: string; event?: boolean }) => void;
}

declare global {
  interface Window {
    goatcounter?: GoatCounter;
  }
}

/** Record one event. `path` is the event name, not a URL. */
export function track(path: string): void {
  if (typeof window === "undefined") return;
  try {
    window.goatcounter?.count?.({ path, event: true });
  } catch {
    // A blocked or half-loaded beacon is not worth a broken render.
  }
}

/**
 * The band an amount falls in, in Indian units.
 *
 * Bucketed rather than exact so the figures aggregate into a readable
 * distribution. Sending the raw number would put one row per distinct amount in
 * the dashboard, which is the same fragmentation the pathname change avoids.
 */
export function amountBucket(rupees: number): string {
  if (rupees < 25_000) return "under-25k";
  if (rupees < 50_000) return "25k-50k";
  if (rupees < 100_000) return "50k-1L";
  if (rupees < 200_000) return "1L-2L";
  if (rupees < 500_000) return "2L-5L";
  if (rupees < 1_000_000) return "5L-10L";
  return "10L-plus";
}
