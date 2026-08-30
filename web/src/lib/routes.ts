// Every URL this site publishes, in one list.
//
// Imported by both src/pages/sitemap.xml.ts and the getStaticPaths of the pages
// themselves, so a route cannot exist in the sitemap without existing on disk, or
// the other way round. Enumerating it twice is how a sitemap starts advertising
// 404s six months after someone renames a directory.

import { entities } from "./entities";

export interface Route {
  /** Always absolute, always with a trailing slash except the root. */
  path: string;
  /** Sitemap hint. Yearly figures move when a Budget lands, not weekly. */
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}

const route = (path: string, priority: number, changefreq: Route["changefreq"] = "monthly"): Route => ({
  path,
  priority,
  changefreq,
});

/**
 * The full route table.
 *
 * Order is the order a crawler meets them, so it runs most important first: the
 * calculator, the method, then the categories a reader actually searches for
 * ("defence budget", "ministry of railways budget"), then the long tail.
 */
export function allRoutes(): Route[] {
  return [
    route("/", 1.0, "monthly"),
    route("/method/", 0.9),
    route("/sources/", 0.5, "yearly"),
    route("/where/", 0.9),
    route("/ministry/", 0.8),
    route("/demand/", 0.8),
    route("/state/", 0.7),
    route("/year/", 0.8),
    ...entities.years.map((year) => route(`/year/${year.id}/`, 0.8)),
    ...entities.purposes.map((purpose) => route(`/where/${purpose.slug}/`, 0.8)),
    ...entities.ministries.map((ministry) => route(`/ministry/${ministry.slug}/`, 0.6)),
    ...entities.lines.map((line) => route(`/demand/${line.slug}/`, 0.6)),
    ...entities.states.map((state) => route(`/state/${state.slug}/`, 0.6)),
  ];
}

/** Where a line item lives. Used for internal links from every page that lists one. */
export const linePath = (slug: string): string => `/demand/${slug}/`;
export const purposePath = (slug: string): string => `/where/${slug}/`;
export const ministryPath = (slug: string): string => `/ministry/${slug}/`;
export const statePath = (slug: string): string => `/state/${slug}/`;
export const yearPath = (period: string): string => `/year/${period}/`;

/**
 * Where a static page sends a reader who wants their own number.
 *
 * Deliberately bare. It is tempting to deep-link `/?fy=2024-25&at=demand-39` so
 * the reader lands on the line they were just reading about, but parseLink() in
 * lib/link.ts returns null unless `paid` is greater than zero, and every other
 * parameter is then dropped, the link would land on the home screen anyway,
 * having promised otherwise. There is no amount to supply from a static page,
 * because the amount is the one thing only the reader knows.
 */
export const CALCULATOR = "/";
