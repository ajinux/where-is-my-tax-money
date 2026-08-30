// Site-level constants that are not figures.
//
// The site's own origin is deliberately NOT here. It lives in `astro.config.mjs`
// as `site`, which Astro exposes as `Astro.site` to every page and endpoint:
// one value, read from one place. This file used to export a `SITE_URL` string
// beside it, which nothing imported and which would have drifted the first time
// the domain changed.

export const SITE_NAME = "whereismytaxmoney.com";

/**
 * Where "Report a problem" goes.
 *
 * This was a `mailto:` to an address carried over from the design comp, one
 * character different from the maintainer's real one. Mail to the wrong address
 * is lost with no bounce, so the only channel for "your defence figure is wrong"
 * was a coin flip. A form removes the guess, and it also works on a phone with
 * no mail client configured, which `mailto:` quietly does not.
 *
 * The canonical `/forms/d/e/<id>/viewform` address rather than the
 * `forms.gle/ezkiqQB3oDDRzxLK6` short link that resolves to it: the prefill
 * parameters below have to survive as far as the form, and a redirect hop is not
 * somewhere to assume that.
 */
export const FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfT_pYT1c2eQyyV5dFNJpd_R4_aD0cmS4_md1FHvGjDoUoh0Q/viewform";

/** The form's own field ids, read off the live form. */
const FIELD = {
  category: "entry.1627728626",
  report: "entry.749545358",
  pageUrl: "entry.2089862134",
  email: "entry.1105538904",
} as const;

/**
 * The categories the form offers, spelled as the form spells them.
 *
 * Google Forms silently ignores a prefill value it does not recognise, and this
 * question is required, so a near miss lands the reader on a form with an
 * unanswered question and no explanation. The union type is what keeps the two
 * lists from drifting apart.
 */
export type FeedbackCategory = "Feedback" | "Data issue" | "Bug";

/**
 * The page the reader was on, with their own figures stripped out.
 *
 * The address bar carries the whole app state, `paid` and `sur` included: the
 * amount somebody typed in. That is the one number on this site that is nobody
 * else's business, and handing it to a third party because it happened to sit in
 * a query string is exactly the leak this project should not make. The year,
 * lens and row are what make a report reproducible, so those go.
 */
export function reportableLocation(href: string): string {
  try {
    const url = new URL(href);
    url.searchParams.delete("paid");
    url.searchParams.delete("sur");
    return url.toString();
  } catch {
    return "";
  }
}

/** The feedback form, with everything the reader already typed filled in. */
export function feedbackUrl(input: {
  category: FeedbackCategory;
  report: string;
  email?: string;
  href?: string;
}): string {
  const query = new URLSearchParams({ usp: "pp_url" });
  query.set(FIELD.category, input.category);
  query.set(FIELD.report, input.report);

  const page = input.href ? reportableLocation(input.href) : "";
  if (page) query.set(FIELD.pageUrl, page);
  if (input.email?.trim()) query.set(FIELD.email, input.email.trim());

  return `${FEEDBACK_FORM_URL}?${query}`;
}

/**
 * The public repository, for the footer link and the "file an issue" route.
 *
 * This matches the configured remote rather than being inferred from the git
 * author and the directory name, which is what it was while the repo had no
 * remote, and which was wrong on both halves.
 *
 * It has to stay **public**. .github/workflows/web.yml deploys the site to Pages
 * from this repository, and a private one on a paid plan would serve a live site
 * whose every footer links somewhere the reader cannot open.
 *
 * It is worth having: the whole claim of this site is that the figures can be
 * checked, and a reader who cannot reach the data cannot check anything.
 */
export const REPO_URL = "https://github.com/ajinux/where-is-my-tax-money";

export const hasRepo = (): boolean => /^https?:\/\/[^/]+\/[^/]+\/[^/]+/.test(REPO_URL);
export const repoIssues = (): string => `${REPO_URL.replace(/\/+$/, "")}/issues`;
