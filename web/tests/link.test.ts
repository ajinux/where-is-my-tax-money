// The URL is the share, so these are the rules a pasted link obeys.
//
// The regression that prompted them: the copy icon wrote `sub=N`, a navigation
// parameter that build() honours only when the row has children. Copy a state,
// or any final line item, and the link you handed someone landed on the list with
// nothing marked. The rule now is one sentence — the copy icon points at the row
// where it sits, at the depth you are already at — and `sub` is written by "Go
// deeper" alone.

import { test } from "node:test";
import assert from "node:assert/strict";

import { linkQuery, parseLink, type LinkState } from "../src/lib/link.ts";
import type { Summary } from "../src/lib/model.ts";

const summary = {
  datasetVersion: "3",
  newestYear: "2025-26",
  latestFinal: "2024-25",
  yearRange: "2020-21 to 2025-26",
  years: [
    { id: "2024-25", label: "2024–25", tag: "Actuals", status: "actual-final" },
    { id: "2025-26", label: "2025–26", tag: "Revised", status: "revised-estimate" },
  ],
  strip: [],
} satisfies Summary;

/** Someone on the result screen, one lens over, having paid a surcharge. */
const onResult: LinkState = {
  amount: 120_000,
  surcharge: 0.15,
  year: "2024-25",
  lens: "administrative",
  headId: null,
  subIndex: null,
  focusId: null,
};

const params = (query: string) => new URLSearchParams(query);

test("copying a row on the result screen points at the row, not into it", () => {
  const q = params(linkQuery(onResult, { headId: null, subIndex: null, focusId: "defence" }));
  assert.equal(q.get("row"), "defence");
  assert.equal(q.get("at"), null, "the result screen has no head open");
  assert.equal(q.get("sub"), null);
});

test("copying inside a head writes at= and row=, and never sub=", () => {
  // The bug in one assertion. `sub` here would have been silently dropped by the
  // leaf guard in build(), leaving the reader on the list with nothing marked.
  const inDevolution: LinkState = { ...onResult, headId: "devolution" };
  const q = params(linkQuery(inDevolution, { focusId: "tamil-nadu" }));
  assert.equal(q.get("at"), "devolution");
  assert.equal(q.get("row"), "tamil-nadu");
  assert.equal(q.get("sub"), null);
});

test("copying one level down keeps the depth and adds the row", () => {
  const inScheme: LinkState = { ...onResult, headId: "cess", subIndex: 1 };
  const q = params(linkQuery(inScheme, { focusId: "jal-jeevan" }));
  assert.equal(q.get("at"), "cess");
  assert.equal(q.get("sub"), "1", "the drill itself is still positional");
  assert.equal(q.get("row"), "jal-jeevan");
});

test("a row link survives the round trip", () => {
  const shapes: LinkState[] = [
    { ...onResult, focusId: "defence" },
    { ...onResult, headId: "devolution", focusId: "tamil-nadu" },
    { ...onResult, headId: "cess", subIndex: 1, focusId: "jal-jeevan" },
    // Plain navigation, nothing focused, purpose lens, no surcharge.
    { ...onResult, surcharge: 0, lens: "purpose", headId: "interest", subIndex: 0 },
  ];
  for (const shape of shapes) {
    const back = parseLink(linkQuery(shape), summary);
    assert.ok(back, "a link with an amount always parses");
    for (const key of ["amount", "surcharge", "year", "lens", "headId", "subIndex", "focusId"] as const) {
      assert.deepEqual(back[key], shape[key], `${key} in ${linkQuery(shape)}`);
    }
    assert.equal(back.screen, shape.headId ? "detail" : "result");
  }
});

test("a link with no amount is not a link", () => {
  // Every URL that is not a share: the bare domain, or one someone truncated.
  assert.equal(parseLink("", summary), null);
  assert.equal(parseLink("?fy=2024-25&at=devolution&row=tamil-nadu", summary), null);
  assert.equal(parseLink("?paid=0", summary), null);
});

test("an unknown year falls back to the latest settled one, not the newest", () => {
  // A link shared before a year was published, or after one was renamed. It has
  // to land somewhere, and the somewhere is where the picker opens: the newest
  // year is a revised estimate nobody has paid a full year of tax under, so
  // falling back there would answer with figures for a year that has not ended.
  const back = parseLink("?paid=120000&fy=2099-00", summary);
  assert.equal(back?.year, summary.latestFinal);
  assert.notEqual(back?.year, summary.newestYear);
});
