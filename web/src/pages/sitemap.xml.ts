// The sitemap, built from lib/routes.ts, the same list the pages themselves are
// generated from, so it cannot advertise a URL that does not exist.
//
// Hand-rolled rather than @astrojs/sitemap. The integration's job is discovering
// routes it does not know about, and here every route comes from one dataset we
// already hold: the discovery is the part we do not need, and its
// sitemap-index → sitemap-0 indirection is a thing to explain to Search Console
// in exchange for nothing.

import type { APIRoute } from "astro";

import { entities } from "../lib/entities";
import { allRoutes } from "../lib/routes";

/**
 * `lastmod` is the dataset version, not the build clock.
 *
 * A CI rebuild that changed nothing would otherwise re-date all 200 URLs and
 * teach a crawler that this site's dates mean nothing. The figures change when
 * the dataset changes; that is the date to publish.
 */
function lastmod(): string {
  const parsed = new Date(entities.builtAt);
  const stamp = Number.isNaN(parsed.valueOf()) ? new Date() : parsed;
  return stamp.toISOString().slice(0, 10);
}

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL("https://whereismytaxmoney.com");
  const modified = lastmod();

  const urls = allRoutes()
    .map(({ path, changefreq, priority }) =>
      [
        "  <url>",
        `    <loc>${new URL(path, origin).href}</loc>`,
        `    <lastmod>${modified}</lastmod>`,
        `    <changefreq>${changefreq}</changefreq>`,
        `    <priority>${priority.toFixed(1)}</priority>`,
        "  </url>",
      ].join("\n")
    )
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
