// Where the share button sits in the document.
//
// On a phone the result grid is a single column, so source order is what the
// reader scrolls through: the button has to come after every line item. That is a
// property of the markup, not of the stylesheet, so it is worth asserting — a
// later refactor that moves the button back inside the summary column would look
// fine on a desktop and be wrong on every phone.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { build } from "../src/lib/build.ts";
import type { YearData } from "../src/lib/model.ts";
import { rank } from "../src/lib/rank.ts";
import { Result } from "../src/components/Result.tsx";

const HERE = dirname(fileURLToPath(import.meta.url));
const year = JSON.parse(
  readFileSync(join(HERE, "..", "public", "data", "2024-25.json"), "utf8")
) as YearData;

function render() {
  const built = build({
    year,
    amount: 120_000,
    surcharge: 0,
    lens: "administrative",
    headId: null,
    subIndex: null,
  });
  return {
    built,
    html: renderToStaticMarkup(
      <Result
        built={built}
        amount={120_000}
        yearLabel="2024–25"
        lens="administrative"
        copiedRow={null}
        focusId={null}
        rank={rank(120_000)}
        onLens={() => {}}
        onEdit={() => {}}
        onOpen={() => {}}
        onCopyRow={() => {}}
        onShare={() => {}}
      />
    ),
  };
}

test("the share button comes after every line item in the document", () => {
  const { built, html } = render();

  const share = html.indexOf("Share this receipt");
  assert.ok(share > 0, "the share button should be rendered");

  // The last row in the list is the smallest ministry; the button must follow it.
  const last = built.rows[built.rows.length - 1];
  const lastRow = html.lastIndexOf(last.label);
  assert.ok(lastRow > 0, `expected to find the last row (${last.label}) in the markup`);

  assert.ok(
    share > lastRow,
    "the share button must come after the last line item, or it appears mid-page on mobile"
  );
});

test("all 56 ministries render, with no collapsing bucket", () => {
  const { built, html } = render();
  const heads = built.rows.filter((row) => row.id !== "devolution");
  assert.equal(heads.length, 56);
  assert.ok(!html.includes("All other"), "there should be no 'all other ministries' bucket");
});

test("the summary and the list are separate grid children", () => {
  const { html } = render();
  for (const cls of ["result-grid", "result-summary", "result-list", "result-share"]) {
    assert.ok(html.includes(cls), `missing ${cls} — the responsive reorder depends on it`);
  }
  // The share wrapper must not be nested inside the summary column, or the
  // single-column order breaks again.
  const summary = html.indexOf('class="result-summary"');
  const list = html.indexOf('class="result-list"');
  const share = html.indexOf('class="result-share"');
  assert.ok(summary < list && list < share, "grid children must be in source order");
});

// --- the narrow screens centre within the panel ------------------------------
//
// Input, Share, Method and Feedback are flex-column children of the 1120px
// panel, so `max-width` caps them but nothing centres them: without an auto
// inline margin they cling to the left edge with a screen's worth of empty
// space beside them on a desktop. That is invisible at the 430px the design was
// drawn at, which is exactly how it shipped the first time — so it is worth
// pinning rather than trusting to eye.

import { AmountInput } from "../src/components/AmountInput.tsx";
import { Feedback } from "../src/components/Feedback.tsx";
import { Method } from "../src/components/Method.tsx";
import { Share } from "../src/components/Share.tsx";

const noop = () => {};

test("the narrow screens centre rather than clinging to the left edge", () => {
  const screens: [string, string][] = [
    [
      "AmountInput",
      renderToStaticMarkup(
        <AmountInput
          amountStr="1,20,000"
          amount={120_000}
          surcharge={0}
          year="2024-25"
          years={[{ id: "2024-25", label: "2024–25", tag: "Latest final figures", status: "actual-final" }]}
          onAmount={noop}
          onSurcharge={noop}
          onYear={noop}
          onSubmit={noop}
        />
      ),
    ],
    [
      "Share",
      renderToStaticMarkup(
        <Share
          card={{ kicker: "k", big: "₹1", sub: "s", lines: [] }}
          yearLabel="2024–25"
          canShare={false}
          shared={false}
          copied={false}
          onBack={noop}
          onShare={noop}
          onCopyLink={noop}
        />
      ),
    ],
    [
      "Method",
      renderToStaticMarkup(
        <Method
          yearLabel="2024–25"
          yearTag="Latest final figures"
          divisiblePoolPercent={41}
          awardLabel="Fifteenth Finance Commission"
          onBack={noop}
        />
      ),
    ],
    ["Feedback", renderToStaticMarkup(<Feedback onBack={noop} />)],
  ];

  for (const [name, html] of screens) {
    const root = html.slice(0, html.indexOf(">") + 1);
    assert.match(
      root,
      /margin-inline:\s*auto/,
      `${name}'s root needs an auto inline margin, or it sits hard left on a wide screen`
    );
    assert.match(root, /max-width:\s*\d+px/, `${name} should still be width-capped`);
  }
});

test("the page is painted cream, with no sand ground behind the panel", () => {
  const shell = readFileSync(join(HERE, "..", "src", "components", "App.tsx"), "utf8");
  const outer = shell.slice(shell.indexOf('minHeight: "100vh"'));
  const wrapper = outer.slice(0, outer.indexOf("}}"));
  assert.ok(
    wrapper.includes('background: "var(--color-bg)"'),
    "the outer wrapper paints the gutters; sand there reads as an empty frame"
  );

  // The strip's unselected blocks are the one place neutral-300 must survive as
  // a fill — flattening it would destroy what the strip communicates.
  const build = readFileSync(join(HERE, "..", "src", "lib", "build.ts"), "utf8");
  assert.ok(
    build.includes('"var(--color-neutral-300)"'),
    "the detail strip still needs neutral-300 for its unselected blocks"
  );
});

// --- the two row treatments stay distinct ------------------------------------
//
// The comp draws two row containers: a plain rule-separated one at the top level,
// and a padded, rounded, more compact one for the nested lists. They were merged
// into a single shape once, which silently dropped the rounded corner and the
// smaller type scale. These pin the difference so a future tidy-up cannot repeat
// it — the failure mode is entirely visual and otherwise only shows in a
// screenshot.

import { RowItem } from "../src/components/RowItem.tsx";
import type { DisplayRow } from "../src/lib/build.ts";

const sampleRow: DisplayRow = {
  id: "uttar-pradesh",
  label: "Uttar Pradesh",
  amount: "₹7,014",
  yours: 7014,
  percentText: "17.9%",
  national: "₹2.50 lakh cr",
  tone: "var(--color-accent-500)",
  barWidth: "100%",
  hasChildren: false,
};

/** The row's own container is the first tag in the markup. */
const containerOf = (html: string) => html.slice(0, html.indexOf(">") + 1);

test("a nested row is a rounded, padded block", () => {
  const html = renderToStaticMarkup(
    <RowItem row={sampleRow} copied={false} onCopy={() => {}} variant="nested" />
  );
  const container = containerOf(html);

  assert.match(container, /border-radius:\s*var\(--radius-md\)/, "the curve the design shows");
  assert.match(container, /padding:\s*14px 10px/);
  // Without the negative margin the padding would indent every row out of line
  // with the heading above it.
  assert.match(container, /margin:\s*0 -8px/);
  assert.match(container, /border-top:\s*1px solid var\(--color-divider\)/);
});

test("a top-level row stays a plain rule, with the larger type scale", () => {
  const html = renderToStaticMarkup(<RowItem row={sampleRow} copied={false} onCopy={() => {}} />);
  const container = containerOf(html);

  assert.doesNotMatch(container, /border-radius/, "the top-level row is not a rounded block");
  assert.doesNotMatch(container, /margin:\s*0 -8px/);
  assert.match(container, /border-top:\s*1px solid var\(--color-divider\)/);

  // The two variants differ in bar thickness: 8px at the top, 6px nested.
  assert.match(html, /height:\s*8px/);
  const nestedHtml = renderToStaticMarkup(
    <RowItem row={sampleRow} copied={false} onCopy={() => {}} variant="nested" />
  );
  assert.match(nestedHtml, /height:\s*6px/);
  assert.doesNotMatch(nestedHtml, /height:\s*8px/, "nested bars are the thinner pair");
});

test("a link-focused nested row keeps its tint and its curve together", () => {
  const html = renderToStaticMarkup(
    <RowItem row={sampleRow} copied={false} onCopy={() => {}} variant="nested" focused />
  );
  const container = containerOf(html);
  assert.match(container, /background:\s*var\(--color-accent-100\)/);
  assert.match(container, /border-radius:\s*var\(--radius-md\)/);
  // A tinted row must not also take the hover class, or the pointer overpaints
  // the very highlight the shared link was pointing at.
  assert.doesNotMatch(container, /row-nested/);
});

// --- a linked row is findable ------------------------------------------------
//
// Paste a copied row link and the row it names has to announce itself. The scroll
// needs a real layout and is checked by eye; what can be pinned here is the
// resting mark it scrolls to — faint enough to be missed if the ring is ever
// dropped, since #fff2eb on a #f5ead8 ground is a difference you have to be told
// about.

test("a linked row carries the ring, in both variants", () => {
  for (const variant of ["top", "nested"] as const) {
    const container = containerOf(
      renderToStaticMarkup(
        <RowItem row={sampleRow} copied={false} onCopy={() => {}} variant={variant} focused />
      )
    );
    assert.match(container, /box-shadow:\s*inset 0 0 0 2px var\(--color-accent-300\)/, variant);
    assert.match(container, /border-radius:\s*var\(--radius-md\)/, variant);
    assert.match(container, /row-focus/, `${variant} should pulse once on arrival`);
    // The ring is the row's edge; a divider would draw a square line across its
    // rounded top.
    assert.match(container, /border-top:\s*1px solid transparent/, variant);
  }
});

test("a top-level linked row borrows a box without moving its text", () => {
  // The top-level variant has no padding of its own, so the ring needs one. The
  // inline padding and the negative margin have to cancel, or the linked row sits
  // 10px out of line with every row around it.
  const container = containerOf(
    renderToStaticMarkup(<RowItem row={sampleRow} copied={false} onCopy={() => {}} focused />)
  );
  assert.match(container, /padding-inline:\s*10px/);
  assert.match(container, /margin-inline:\s*-10px/);
});

test("an ordinary row carries none of it", () => {
  const container = containerOf(
    renderToStaticMarkup(
      <RowItem row={sampleRow} copied={false} onCopy={() => {}} variant="nested" />
    )
  );
  assert.doesNotMatch(container, /box-shadow/);
  assert.doesNotMatch(container, /row-focus/);
  assert.doesNotMatch(container, /accent-100/);
});
