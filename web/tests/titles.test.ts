// The reference pages' titles. Two properties are worth holding on to: the
// search phrasing itself, and that no two pages end up sharing a title, which is
// the failure the ministry/line split in lib/titles.ts exists to prevent.

import { test } from "node:test";
import assert from "node:assert/strict";

import { entities } from "../src/lib/entities.ts";
import { budgetTopic, lineTitle, ministryTitle } from "../src/lib/titles.ts";

test("the body prefix comes off, and only from the front", () => {
  assert.equal(budgetTopic("Department of Agriculture and Farmers Welfare"), "Agriculture and Farmers Welfare");
  assert.equal(budgetTopic("Ministry of Railways"), "Railways");
  assert.equal(budgetTopic("Department for Promotion of Industry and Internal Trade"), "Promotion of Industry and Internal Trade");
  assert.equal(budgetTopic("Indian Audit and Accounts Department"), "Indian Audit and Accounts Department");
  assert.equal(budgetTopic("Police"), "Police");
});

test("a line title reads as the search does", () => {
  assert.equal(
    lineTitle("Department of Agriculture and Farmers Welfare", "2025–26", "₹1,000 crore"),
    "Agriculture and Farmers Welfare budget 2025–26: ₹1,000 crore | India"
  );
});

test("no two reference pages share a title", () => {
  const titles = [
    ...entities.lines.map((line) => lineTitle(line.label, "Y", "A")),
    ...entities.ministries.map((ministry) => ministryTitle(ministry.label, "Y", "A")),
  ];
  const seen = new Set<string>();
  const repeated = titles.filter((title) => (seen.has(title) ? true : (seen.add(title), false)));
  assert.deepEqual(repeated, []);
});
