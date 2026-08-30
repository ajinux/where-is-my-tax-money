// End-to-end: the whole journey in TypeScript, against the same journey computed
// in Python from the same dataset.
//
// This is the check that matters most. The unit tests prove `apportion` matches;
// this proves the *pipeline* matches — the build-data transform's ordering, the
// three-way split, and the apportionment across real spending heads, together.
// A plausible-looking mistake in any one of them shows up here as rupees.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "../src/lib/build.ts";
import type { LensName, YearData } from "../src/lib/model.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(HERE, "fixtures.json"), "utf8"));

const years = new Map<string, YearData>();
function year(id: string): YearData {
  const cached = years.get(id);
  if (cached) return cached;
  const data = JSON.parse(
    readFileSync(join(HERE, "..", "public", "data", `${id}.json`), "utf8")
  ) as YearData;
  years.set(id, data);
  return data;
}

test("the three-way split matches the Python for every year and amount", () => {
  for (const journey of fixtures.journeys) {
    const built = build({
      year: year(journey.period),
      amount: journey.paid,
      surcharge: journey.surcharge,
      lens: "purpose",
      headId: null,
      subIndex: null,
    });
    const where = `${journey.period} ₹${journey.paid} @ ${journey.surcharge}`;
    assert.equal(built.split.toStates, journey.toStates, `state share: ${where}`);
    assert.equal(built.split.toCess, journey.toCess, `cess: ${where}`);
    assert.equal(built.split.toUnion, journey.toUnion, `union: ${where}`);
  }
});

test("every spending head gets the rupees the Python gives it", () => {
  for (const journey of fixtures.journeys) {
    for (const lens of ["purpose", "administrative"] as LensName[]) {
      const built = build({
        year: year(journey.period),
        amount: journey.paid,
        surcharge: journey.surcharge,
        lens,
        headId: null,
        subIndex: null,
      });

      // build() puts the state row in the same list; drop it to compare heads.
      const heads = built.rows.filter((row) => row.id !== "devolution");
      const expected: { id: string; yours: number }[] = journey.lenses[lens];

      assert.equal(heads.length, expected.length, `${journey.period} ${lens}: head count`);
      const byId = new Map(heads.map((row) => [row.id, row.yours]));
      for (const head of expected) {
        assert.equal(
          byId.get(head.id),
          head.yours,
          `${journey.period} ${lens} ${head.id} at ₹${journey.paid}`
        );
      }
    }
  }
});

test("the per-state split matches the Python", () => {
  for (const journey of fixtures.journeys) {
    const built = build({
      year: year(journey.period),
      amount: journey.paid,
      surcharge: journey.surcharge,
      lens: "purpose",
      headId: "devolution",
      subIndex: null,
    });
    const byId = new Map(built.inside.map((row) => [row.id, row.yours]));
    for (const state of journey.states) {
      assert.equal(byId.get(state.id), state.yours, `${journey.period} ${state.id}`);
    }
  }
});

test("the cess breakdown matches the Python", () => {
  for (const journey of fixtures.journeys) {
    const built = build({
      year: year(journey.period),
      amount: journey.paid,
      surcharge: journey.surcharge,
      lens: "purpose",
      headId: "cess",
      subIndex: null,
    });
    const byId = new Map(built.inside.map((row) => [row.id, row.yours]));
    for (const fund of journey.cess) {
      assert.equal(byId.get(fund.id), fund.yours, `${journey.period} ${fund.id}`);
    }
  }
});

// --- conservation -----------------------------------------------------------

test("nothing is created or lost, at any depth, in any year or lens", () => {
  for (const journey of fixtures.journeys) {
    const data = year(journey.period);
    for (const lens of ["purpose", "administrative"] as LensName[]) {
      const top = build({
        year: data,
        amount: journey.paid,
        surcharge: journey.surcharge,
        lens,
        headId: null,
        subIndex: null,
      });

      // The rows are the state's share plus Union *spending*. Cess is not in
      // them and must not be: it is earmarked financing credited to reserve
      // funds, and the dataset makes it an invariant that the `financing`
      // perimeter is never summed with `union-spending`. It gets its own line in
      // the three-part panel and its own drill-down. (The comp folded cess into
      // the union bucket, which counts it twice — once inside the spending heads
      // and again as its own part.)
      const rowSum = top.rows.reduce((total, row) => total + row.yours, 0);
      assert.equal(
        rowSum + top.split.toCess,
        journey.paid,
        `${journey.period} ${lens}: rows plus cess must be every rupee paid`
      );
      assert.equal(
        rowSum,
        top.split.toStates + top.split.toUnion,
        `${journey.period} ${lens}: the rows are the state share plus Union spending`
      );

      // Open each head in turn and check its children close against it.
      for (const row of top.rows) {
        const opened = build({
          year: data,
          amount: journey.paid,
          surcharge: journey.surcharge,
          lens,
          headId: row.id,
          subIndex: null,
        });
        if (!opened.head || opened.inside.length === 0) continue;

        const childSum = opened.inside.reduce((total, child) => total + child.yours, 0);
        assert.equal(
          childSum,
          row.yours,
          `${journey.period} ${lens} ${row.id}: children must sum to the head above them`
        );

        // And one level further, wherever the dataset goes that deep.
        for (let i = 0; i < opened.inside.length; i += 1) {
          if (!opened.inside[i].hasChildren) continue;
          const deeper = build({
            year: data,
            amount: journey.paid,
            surcharge: journey.surcharge,
            lens,
            headId: row.id,
            subIndex: i,
          });
          if (deeper.inside.length === 0) continue;
          const grandSum = deeper.inside.reduce((total, child) => total + child.yours, 0);
          assert.equal(
            grandSum,
            opened.inside[i].yours,
            `${journey.period} ${lens} ${row.id}/${opened.inside[i].id}: grandchildren must close`
          );
        }
      }
    }
  }
});

// --- the cess drills two levels, like the dataset publishes it ---------------
//
// Regression. The one-level-deeper drill was written inside the spending-head
// branch, so `?at=cess&sub=1` re-rendered the cess head unchanged: the "Go
// deeper" button appeared, set subIndex and rewrote the URL, and nothing moved.
//
// Cess is reached from the three-part panel rather than from the row list, so
// the conservation loop above — which walks `rows` — never touched it. That is
// how a whole branch of the tree went unexercised.

test("cess drills from fund into the schemes it pays for", () => {
  for (const journey of fixtures.journeys) {
    const data = year(journey.period);
    const args = {
      year: data,
      amount: journey.paid,
      surcharge: journey.surcharge,
      lens: "purpose" as const,
    };

    const funds = build({ ...args, headId: "cess", subIndex: null });
    assert.ok(funds.head, `${journey.period}: cess head should resolve`);
    assert.ok(funds.inside.length > 0, `${journey.period}: cess should list its funds`);

    for (let i = 0; i < funds.inside.length; i += 1) {
      const fund = funds.inside[i];
      if (!fund.hasChildren) continue;

      const schemes = build({ ...args, headId: "cess", subIndex: i });
      assert.notEqual(
        schemes.head?.label,
        funds.head?.label,
        `${journey.period} cess/${fund.id}: drilling must change the head`
      );
      assert.equal(schemes.head?.label, fund.label);
      assert.equal(schemes.head?.parentLabel, funds.head?.label, "back should point at the cess");

      const sum = schemes.inside.reduce((total, row) => total + row.yours, 0);
      assert.equal(
        sum,
        fund.yours,
        `${journey.period} cess/${fund.id}: schemes must sum to the fund above them`
      );
    }
  }
});

test("the whole cess closes against what was paid in cess", () => {
  for (const journey of fixtures.journeys) {
    const built = build({
      year: year(journey.period),
      amount: journey.paid,
      surcharge: journey.surcharge,
      lens: "purpose",
      headId: "cess",
      subIndex: null,
    });
    const sum = built.inside.reduce((total, row) => total + row.yours, 0);
    assert.equal(sum, journey.toCess, `${journey.period}: cess funds must sum to the cess paid`);
  }
});

test("a hand-edited &sub= on a leaf list is ignored rather than obeyed", () => {
  // States are leaves. Nothing in the UI offers a drill there, but a shared or
  // edited URL can still carry one, and it must not swap the head for a state
  // with an empty list underneath it.
  const journey = fixtures.journeys[0];
  const built = build({
    year: year(journey.period),
    amount: journey.paid,
    surcharge: journey.surcharge,
    lens: "purpose",
    headId: "devolution",
    subIndex: 3,
  });
  assert.equal(built.head?.label, "Sent to state governments");
  assert.ok(built.inside.length > 20, "the state list should still be there");
});

// --- the block strip -------------------------------------------------------
//
// The strip above a detail view exists to show how big the chunk you opened is
// next to the others. The comp gated it behind "arrived via a shared link", so it
// was absent exactly when someone was navigating; it now shows at every depth and
// rescales to the level you are on.

const stripWidth = (block: { width: string }) => Number.parseFloat(block.width);
const sumWidths = (strip: { width: string }[]) =>
  strip.reduce((total, block) => total + stripWidth(block), 0);
const coloured = <T extends { tone: string }>(strip: T[]) =>
  strip.filter((block) => block.tone !== "var(--color-neutral-300)");

test("the top-level strip really is the whole tax", () => {
  // The caption claims "your whole tax". Before cess was added as a block the
  // widths summed to ~96%, because cess is deliberately outside `rows`.
  for (const journey of fixtures.journeys) {
    for (const lens of ["purpose", "administrative"] as LensName[]) {
      const built = build({
        year: year(journey.period),
        amount: journey.paid,
        surcharge: journey.surcharge,
        lens,
        headId: "defence-and-security",
        subIndex: null,
      });
      assert.ok(
        Math.abs(sumWidths(built.strip) - 100) < 0.000001,
        `${journey.period} ${lens}: strip covers ${sumWidths(built.strip).toFixed(2)}%, not the whole tax`
      );
      assert.ok(
        built.strip.some((block) => block.id === "cess"),
        "cess must be a block, or the cess view has nothing to highlight"
      );
    }
  }
});

test("exactly one block is coloured, and it is the one you opened", () => {
  const journey = fixtures.journeys[0];
  const data = year(journey.period);
  const args = { year: data, amount: journey.paid, surcharge: journey.surcharge, lens: "purpose" as const };

  for (const headId of ["cess", "devolution", data.lenses.purpose[0].id]) {
    const built = build({ ...args, headId, subIndex: null });
    const lit = coloured(built.strip);
    assert.equal(lit.length, 1, `${headId}: expected one coloured block, got ${lit.length}`);
    assert.equal(lit[0].id, headId, `${headId}: the coloured block should be the head you opened`);
  }
});

test("at depth the strip rescales to siblings, not to the whole tax", () => {
  for (const journey of fixtures.journeys) {
    const data = year(journey.period);
    const args = { year: data, amount: journey.paid, surcharge: journey.surcharge, lens: "purpose" as const };

    const funds = build({ ...args, headId: "cess", subIndex: null });
    for (let i = 0; i < funds.inside.length; i += 1) {
      if (!funds.inside[i].hasChildren) continue;
      const schemes = build({ ...args, headId: "cess", subIndex: i });

      assert.equal(
        schemes.strip.length,
        funds.inside.length,
        `${journey.period}: the strip should show one block per sibling fund`
      );
      assert.ok(
        Math.abs(sumWidths(schemes.strip) - 100) < 0.000001,
        `${journey.period}: siblings should fill the strip`
      );
      const lit = coloured(schemes.strip);
      assert.equal(lit.length, 1);
      assert.equal(lit[0].id, funds.inside[i].id, "the coloured block is the fund you opened");
      assert.match(schemes.stripLabel, /^Inside /, "the caption should name what the strip is scaled to");
    }
  }
});

test("adding cess to the strip has not leaked into the spending list", () => {
  // The strip and `rows` make different claims. `rows` is union spending, which
  // must never include earmarked cess; the strip is the whole bill. Keeping the
  // two apart is the point of building the strip from its own array.
  for (const journey of fixtures.journeys) {
    const built = build({
      year: year(journey.period),
      amount: journey.paid,
      surcharge: journey.surcharge,
      lens: "purpose",
      headId: null,
      subIndex: null,
    });
    assert.ok(!built.rows.some((row) => row.id === "cess"), "cess must stay out of the spending list");
    assert.ok(!built.card.lines.some((line) => /cess/i.test(line.label)), "and out of the share card");
    assert.equal(
      built.rows.reduce((total, row) => total + row.yours, 0) + built.split.toCess,
      journey.paid
    );
  }
});
