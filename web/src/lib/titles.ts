// Page titles for the reference pages, phrased the way people search.
//
// The titles used to lead with the official name and end in "budget and
// spending", so the line for farming was titled "Department of Agriculture and
// Farmers Welfare: budget and spending, 2025–26". Search Console's first three
// months showed what people actually type: "agriculture budget 2025". The topic,
// the word "budget" and the year now sit together at the front, followed by the
// figure itself, because a number in a search result is a reason to click it.
//
// Only the <title> changes. The <h1> stays the official name, which is what the
// source documents call the body and what the page is about.

const BODY_PREFIX = /^(Ministry of|Department of|Department for)\s+/;

/**
 * The subject of a budget line, without the kind of body that runs it.
 *
 * "Department of Agriculture and Farmers Welfare" becomes "Agriculture and
 * Farmers Welfare". A label with no such prefix ("Police", "Interest Payments",
 * "Ladakh") is already its own subject and comes back unchanged.
 */
export function budgetTopic(label: string): string {
  return label.replace(BODY_PREFIX, "");
}

/** A budget line: the topic, stripped of "Department of". */
export function lineTitle(label: string, yearLabel: string, amount: string): string {
  return `${budgetTopic(label)} budget ${yearLabel}: ${amount} | India`;
}

/**
 * A ministry keeps its full name.
 *
 * Seventeen ministries have a single demand that carries the same name, the
 * Ministry of Railways being one, so each has both a ministry page and a line
 * page. Stripping the prefix from both would give the pair one title. People
 * also search for a ministry by its name, "ministry of defence budget".
 */
export function ministryTitle(label: string, yearLabel: string, amount: string): string {
  return `${label} budget ${yearLabel}: ${amount} | India`;
}
