---
name: add-fiscal-year
description: "Use when adding a new fiscal year to the wimtm dataset, re-reading an unsettled year once its actuals are published, or correcting a published figure. Covers which document carries which year, the source manifest entry, the four period files, and the rebuild that has to follow."
---

# Adding a fiscal year

This is the long, rare job: four new period files, around seven new sources, and
roughly 120 facts read out of one table. It happens about once a year, which is
why it is written down.

**The reasoning is not repeated here.** `CLAUDE.md` holds the invariants and
`data/README.md` holds the model. This is the order of operations and the traps.

## Before anything: which document carries the year

An Expenditure Profile's *Actuals* column reports the fiscal year that **ended two
years earlier**. To add actuals for FY `X`, you need the Budget published for
`X + 2`.

```
FY 2024-25 actuals  ←  Expenditure Profile 2026-27
FY 2025-26 actuals  ←  Expenditure Profile 2027-28   (publishes ~Feb 2027)
```

Getting this wrong is silent. Every figure will parse, sum and validate; they will
just be the wrong year's. Check the column heading, not the document title.

The next real occasion for this skill is **2025-26**, currently `revised-estimate`.
When the 2027-28 Budget lands, re-read it from that edition and change `status` to
`actual-final`. That also switches on `estimate-cited-as-actual` and the award
corroboration rule, which do not engage for an unsettled year.

## 1. Add the sources

Roughly seven per year, in `data/dataset/sources.json`:

| Document | Gives you |
|---|---|
| Statement 1, Summary of Expenditure | the authoritative root total |
| Statement 3, Expenditure of Ministries and Departments | every demand, and its revenue/capital columns |
| Budget at a Glance, bag3 | tax devolution total |
| Budget at a Glance, bag5 (Receipts) | gross tax revenue |
| Expenditure Profile Statement 15 | the cess funds |
| Notes on Demands | only where you are decomposing a demand |

Follow the shape of the existing entries. `period` is the **data** year, not the
publication year. Then:

```bash
cd data && uv run wimtm-data sources-fetch    # downloads and records checksums
```

One publication often carries several years in parallel columns. Where it does,
the new entry shares `file` and `checksumSha256` with its sibling and differs only
in `notes` saying which column it reads. That is why the manifest has more entries
than files.

## 2. The union-expenditure period file

`data/dataset/sections/union-expenditure/<period>.json`. Declare `period`,
`status`, `perimeter: "union-spending"`, a cited `root` from Statement 1, then:

- **`facts`**: one per demand, each with `amount` and a `cite` whose locator names
  the statement, demand number, column and year. Copy the locator wording from the
  previous year exactly; it is how a reader re-finds the number.
- **`trees`**: a `purpose` tree and an `administrative` tree, both `of: "@root"`,
  each grouping every fact exactly once. Plus one `account-class` tree per demand
  for the revenue/capital split, with inline parts rather than promoted facts.

Reuse ids. `demand-25` is the same line item across years, and that identity is
what `label-drift` and `group-drift` check. A demand that genuinely moved category
needs naming in that tree's `notes`, which exempts that id and nothing else.

### Reading Statement 3

Two things learned the hard way, both in `CLAUDE.md` under Known data gaps:

- **Read rows from the right.** A nil column prints `...`, so a row whose leading
  figures are all nil gives a left-to-right scan nothing to anchor on.
- **Row layout differs between editions.** The 2022-23 edition numbers rows
  `1. Department of…` where later ones print `Demand No. 1`. A single regex finding
  nothing means the layout changed, not that the PDF is scanned. That mistake cost
  three years of believing an OCR problem existed.

Anchor every extracted row on a figure the dataset already publishes, so the
extraction checks itself instead of being trusted.

## 3. The other three sections

Much smaller. Each is a cited root, and for two of them a generator:

- **tax-receipts**: gross tax revenue from bag5, plus a `shareability` tree using
  the `divisible-pool` method.
- **tax-devolution**: the devolution total from bag3, plus a `recipient` tree using
  `finance-commission-shares` with the `awardId` **whose award period covers this
  year**. Naming the wrong award produces a complete, plausible, exactly-summing
  state split from the wrong percentages. `award-period-mismatch` exists because
  that happened. Note 2020-21 has its own single-year award.
- **cess-earmark**: always `revised-estimate`, never actuals, because Statement 15
  publishes no actuals column. Statement 15 is printed **rotated**: read it as
  geometry (`chars` with `upright=False`), the rotated label is centred on its rows
  so the first and Total rows fall outside its extent, and the block appearing
  first in the text stream is not reliably the RE.

## 4. Labels

A fact's label lives in that section's `section.json`, written once for all
periods, not in the period file. If your new year names a demand differently from
the others, `label-drift` will say so. Usually the other years are right and the
new reading is OCR damage; adopt what they corroborate and record the damage in
the period's `notes`.

## 5. Rebuild, in this order

```bash
cd data
uv run wimtm-data validate     # reports every problem at once, not just the first
uv run wimtm-data build        # rewrites dist/dataset.v3.json
uv run pytest                  # includes the gate that dist matches the pipeline

cd ../web && npm test && npm run build
```

`data/dist/dataset.v3.json` is committed and must go in the same commit as the
dataset edit. `web/`'s own generated data is gitignored and regenerates itself.

## When validate fails

Each rule names a real mistake. The common ones on a new year:

| Rule | What it usually means |
|---|---|
| `sum-mismatch` | a demand misread, or one missing from a tree |
| `orphaned-fact` | a fact exists but no tree places it |
| `fact-referenced-twice` | it is in two groups of the same partition |
| `partitions-disagree` | purpose and administrative do not cover the same facts |
| `label-drift` / `group-drift` | this year names or files a demand unlike the others |
| `estimate-cited-as-actual` | an `actual-final` period citing a budget-estimate source |
| `award-period-mismatch` | the award named does not cover this year |
| `uncited-source` | a source was added but nothing uses it |

Do not weaken a rule to make a year fit. `sum-mismatch` refusing a per-state split
that does not reconcile is the rule working, not an obstacle.

---

# Correcting a figure

Much shorter, and the common contribution.

1. Edit the amount in the one period file under
   `data/dataset/sections/<section>/<period>.json`. Amounts stay in the unit the
   source prints (`{ value, unit }`); the build converts exactly.
2. Check the `cite` still names where the corrected figure was read from. A new
   figure from a different column or document needs its locator updated too.
3. Rebuild and test:

```bash
cd data && uv run wimtm-data validate && uv run wimtm-data build && uv run pytest
```

**Never edit `dist/dataset.v3.json` by hand.** It is generated. Editing it makes
the artifact disagree with its source, and `test_verification_gate.py` fails on
exactly that. Commit the rebuilt artifact with the correction.

If the correction changes a label or a group rather than an amount, it belongs in
`section.json` or the vocabulary, not in the period file, or it will drift from
the other years.
