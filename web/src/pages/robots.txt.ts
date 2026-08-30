// robots.txt.
//
// Everything is allowed, including the AI crawlers, and that is a decision
// rather than a default: this is public finance data assembled from public
// documents and published under an open licence. Being quoted by an assistant
// answering "how much does India spend on defence" is the point of the exercise,
// not a leak of it.
//
// The one thing worth excluding is nothing at all, there is no admin surface,
// no user content and no paywall here to protect.

import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL("https://whereismytaxmoney.com");

  const body = `User-agent: *
Allow: /

Sitemap: ${new URL("/sitemap.xml", origin).href}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
