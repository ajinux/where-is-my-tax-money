// The surcharge guess is an estimate about the reader, not a step in the
// allocation, so it is kept out of the fixture parity suite. What it does claim
// is stronger than an estimate and is what these tests pin: below a boundary the
// answer is "none", and above it the income that produced the bill cannot have
// been under the threshold whichever regime was filed under.

import { test } from "node:test";
import assert from "node:assert/strict";

import { guessSurcharge } from "../src/lib/surcharge.ts";

/**
 * The boundaries, worked by hand from the published slabs. Each is the total a
 * person sitting exactly on the income threshold pays, under the old regime,
 * which charges more than the new one at every one of these incomes.
 *
 *   ₹50 lakh:   12,500 + 1,00,000 + 30% of 40L    = 13,12,500, +4% cess
 *   ₹1 crore:   12,500 + 1,00,000 + 30% of 90L    = 28,12,500, +10% sur, +4% cess
 *   ₹2 crore:   12,500 + 1,00,000 + 30% of 1.9cr  = 58,12,500, +15% sur, +4% cess
 */
const BOUNDARY = { ten: 1_365_000, fifteen: 3_217_500, twentyFive: 6_951_750 };

test("no surcharge is suggested below the first boundary", () => {
  for (const amount of [0, 1, 25_000, 120_000, 600_000, 1_200_000, BOUNDARY.ten]) {
    assert.equal(guessSurcharge(amount), null, `₹${amount} should suggest nothing`);
  }
});

test("each boundary is exact to the rupee", () => {
  assert.equal(guessSurcharge(BOUNDARY.ten), null);
  assert.equal(guessSurcharge(BOUNDARY.ten + 1)?.rate, 0.1);

  assert.equal(guessSurcharge(BOUNDARY.fifteen)?.rate, 0.1);
  assert.equal(guessSurcharge(BOUNDARY.fifteen + 1)?.rate, 0.15);

  assert.equal(guessSurcharge(BOUNDARY.twentyFive)?.rate, 0.15);
  assert.equal(guessSurcharge(BOUNDARY.twentyFive + 1)?.rate, 0.25);
});

test("a tax bill of ₹20 lakh implies an income above ₹50 lakh", () => {
  const guess = guessSurcharge(2_000_000);
  assert.equal(guess?.rate, 0.1);
  assert.equal(guess?.incomeLabel, "₹50 lakh");
});

test("the guess never goes down as the amount goes up", () => {
  let previous = 0;
  for (let amount = 0; amount <= 300_000_000; amount += 137_000) {
    const rate = guessSurcharge(amount)?.rate ?? 0;
    assert.ok(rate >= previous, `₹${amount}: ${rate} fell below ${previous}`);
    previous = rate;
  }
});

test("37% is never guessed, because the new regime does not levy it", () => {
  for (const amount of [10_000_000, 100_000_000, 1_000_000_000]) {
    assert.equal(guessSurcharge(amount)?.rate, 0.25, `₹${amount} should stop at 25%`);
  }
});
