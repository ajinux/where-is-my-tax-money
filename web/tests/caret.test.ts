// Typing into the middle of an amount that regroups itself as you type.
//
// The input is controlled and the value is regrouped on every keystroke, so
// every edit hands the browser a string it did not type and the caret falls to
// the end unless it is put back. It cannot be put back by character offset: an
// inserted digit can push a comma across the caret. AmountInput therefore
// counts digits, which regrouping never changes, and these are that arithmetic.

import { test } from "node:test";
import assert from "node:assert/strict";

import { caretAfterDigits, digitsBefore } from "../src/components/AmountInput.tsx";
import { parseAmount } from "../src/lib/format.ts";

/** What AmountInput and App do between a keystroke and the caret landing. */
function typeInto(shown: string, caret: number, typed: string): [string, number] {
  const raw = shown.slice(0, caret) + typed + shown.slice(caret);
  const digits = digitsBefore(raw, caret + typed.length);
  const n = parseAmount(raw);
  const next = n ? n.toLocaleString("en-IN") : "";
  return [next, caretAfterDigits(next, digits)];
}

test("a digit typed two places from the end lands where it was typed", () => {
  const [shown, caret] = typeInto("1,60,000", 6, "2");

  assert.equal(shown, "16,00,200");
  assert.equal(caret, 7, "the caret should sit just after the typed 2");
  assert.equal(shown[caret - 1], "2");
});

test("the caret stays put across the comma a new digit pushes over it", () => {
  // "1,00,000" is one digit short of gaining a separator: typing at the front
  // makes it "11,00,000", and every character after the caret shifts right.
  const [shown, caret] = typeInto("1,00,000", 1, "1");

  assert.equal(shown, "11,00,000");
  assert.equal(caret, 2, "the caret should follow the digit, not the offset");
});

test("typing at the end still ends at the end", () => {
  const [shown, caret] = typeInto("12,000", 6, "0");

  assert.equal(shown, "1,20,000");
  assert.equal(caret, shown.length);
});

test("an empty caret position is the start, not the end", () => {
  assert.equal(digitsBefore("1,20,000", 0), 0);
  assert.equal(caretAfterDigits("1,20,000", 0), 0);
});

test("separators are not counted as places", () => {
  assert.equal(digitsBefore("1,20,000", 4), 3, "1, 2 and 0 sit before the second comma");
  assert.equal(caretAfterDigits("1,20,000", 2), 3);
});
