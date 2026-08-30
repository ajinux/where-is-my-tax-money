// "Your badge" is a rough estimate against public filing data, deliberately kept
// out of build.ts — the audited view model — so this file only has to answer:
// does the curve move the right direction, and does it land in the tier the
// real breakpoints predict.

import { test } from "node:test";
import assert from "node:assert/strict";

import { rank } from "../src/lib/rank.ts";

test("a bigger payment never ranks rarer than a smaller one", () => {
  const amounts = [1_000, 25_000, 100_000, 500_000, 1_500_000, 5_000_000, 30_000_000];
  let prevTop = Number.POSITIVE_INFINITY;
  for (const amount of amounts) {
    const top = Number.parseFloat(rank(amount).topText);
    assert.ok(top <= prevTop, `₹${amount}: top-% should not rise as the amount grows`);
    prevTop = top;
  }
});

test("real amounts land in the tier the breakpoint table predicts", () => {
  // Breakpoints from the plan: payer-percentile 0/50/80/95/99 land at roughly
  // ₹1 / ₹90,000 / ₹340,000 / ₹1,200,000 / ₹5,300,000 in top-of-adults terms.
  assert.equal(rank(5_000).badge.name, "Quiet contributor");
  assert.equal(rank(150_000).badge.name, "Steady hand");
  assert.equal(rank(500_000).badge.name, "Heavy lifter");
  assert.equal(rank(1_500_000).badge.name, "Rare company");
  assert.equal(rank(6_000_000).badge.name, "Top of the table");
});

test("topText and oneIn stay finite and sane at both ends of the scale", () => {
  for (const amount of [1, 100, 31_000_000, 500_000_000]) {
    const { topText, oneIn } = rank(amount);
    const top = Number.parseFloat(topText);
    assert.ok(Number.isFinite(top) && top > 0 && top <= 2.4, `₹${amount}: topText=${topText}`);
    const n = Number.parseInt(oneIn.replace(/,/g, ""), 10);
    assert.ok(Number.isFinite(n) && n > 0, `₹${amount}: oneIn=${oneIn}`);
  }
});

test("paying anything at all is already the lowest tier, not unranked", () => {
  const { badge, topText } = rank(1);
  assert.equal(badge.name, "Quiet contributor");
  assert.equal(topText, "2.4%");
});
