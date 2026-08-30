# Contributing

Corrections are the most valuable contribution here. If a figure is wrong, or a department is filed under the wrong purpose, that is worth more than a new feature.

```bash
uv sync                     # installs the one venv: pydantic, pytest, mypy, ruff
uv run wimtm-data validate
uv run pytest
uv run ruff check wimtm_data/ tests/
```

Those are what CI runs for the dataset. `web/` is a separate Node toolchain with its own tests; it reads the committed artifact and nothing in here depends on it.

`validate` reports **every** problem it finds in one run, not just the first, so you can fix a file in one pass.

If you don't have [uv](https://docs.astral.sh/uv/), `pip install -e .` into a fresh venv works too — `pyproject.toml` is the single source of truth for dependencies either way.

A pull request touching `data` runs the same four steps in CI (`.github/workflows/data.yml`) — type check, test, validate, build — so this is a safety net, not the only place these run.

## Before you change a number

Get the source document and confirm you are reading the same bytes we did:

```bash
uv run wimtm-data sources-fetch
```

This downloads each PDF from its canonical government URL into `.cache/sources/` and checks its SHA-256 against `dataset/sources.json`. If a checksum mismatches, the publisher has replaced the document — say so in your pull request rather than working around it, because it means every figure citing that document needs re-checking.

## The whole model, in three ideas

Learn these and every change below is the same edit.

**A fact** is a published figure — an amount, a citation, and optionally a `basis` saying how its destination is decided. Facts live in one flat list per section. They are the only thing that carries an amount. A fact's own name usually lives beside it, not on it: `sections/<name>/section.json`'s `lines` map holds one label per id, written once for every period that carries it. A fact only carries its own inline `label` when the section has no such registry entry for that id.

**A tree** decomposes something into facts along a named axis. `of` says what it decomposes (`@root`, or a fact id); `axis` says which question it answers.

> **The parts of a tree must sum exactly to what they decompose.** This is the rule. It applies identically whether you are splitting a year into purpose categories, a demand into its components, or a component into the states that received it.

**A section** is one period of one thing — expenditure, devolution, receipts, the cess earmark — declaring its `period`, `status` and `perimeter`. Every section in the dataset has the same shape.

## Common changes

**Correcting an amount.** Edit the fact's `amount.value`. If anything decomposes it, or it is part of something that does, the sums must still hold — `validate` tells you by how much you are now off, and from which direction.

**Recategorising a department.** Move the fact id from one group's `children` to another in the `purpose` tree. Don't touch `facts`. Both partitions must still cover the same facts.

Do it in **every** period, or the category's history stops being true — a chart of "what agriculture cost over five years" would show a step that no budget contains. If the move really did happen in one year only, say so in that tree's `notes` and name the id you moved; `group-drift` reads the note and exempts exactly that id, not the whole tree.

**Adding a sub-category.** Replace a fact id in `children` with `{ "group": "new-id", "children": [...] }` and add `new-id` to `vocabulary/purpose.json`. Labels live only in the vocabulary — never write one on a tree.

**Breaking a figure down.** This is the most valuable contribution and it needs no schema change. Find the document that publishes the parts — for a demand, its Notes on Demands at `doc/eb/sbe<N>.pdf` — then add each part as a fact, name it once in the section's `section.json`, and add one tree pointing at the total:

```jsonc
// sections/union-expenditure/section.json, in "lines"
"capital-investment-loans": { "label": "Special Assistance as Loan to States for Capital Investment" },

// facts
{ "id": "capital-investment-loans",
  "description": "Fifty-year interest-free loans to states for capital investment.",
  "basis": "Discretionary and conditional — a state draws it only by qualifying.",
  "amount": { "value": 149483.73, "unit": "crore-rupees" },
  "cite": [{ "sourceId": "mof-2024-25-demand-42-notes", "locator": "item 11" }] },

// trees
{ "of": "demand-42", "axis": "destination",
  "children": ["capital-investment-loans", "local-body-grants", "..."] }
```

The demand's own published total is the cross-check. A misread row fails the build instead of quietly shifting every other part's share.

**Adding the revenue/capital split.** Different shape from the others, because Revenue, Capital and Total are three columns of **one row of one document** — there is no second document for a part to corroborate against, so promoting each column to a full fact would invent a permanent id that buys no corroboration. Instead a classification tree carries its parts inline, with one citation for the whole split:

```jsonc
{
  "of": "demand-1",
  "axis": "account-class",
  "parts": [
    {
      "group": "revenue",
      "amount": { "value": 129811.28, "unit": "crore-rupees" },
    },
    {
      "group": "capital",
      "amount": { "value": 122.19, "unit": "crore-rupees" },
    },
  ],
  "cite": [
    {
      "sourceId": "mof-2024-25-statement-3",
      "locator": "Statement 3, Demand No. 1, Actuals 2024-25, Revenue and Capital columns",
    },
  ],
}
```

The sum rule still applies exactly — `revenue + capital` must equal the demand's own published total, with the same zero tolerance as everywhere else. `group` ids (`revenue`, `capital`) come from `dataset/vocabulary/account-class.json`. This split is **complete for all six years**, every demand closing exactly to the rupee against Statement 3's own Total column, so there is nothing left to backfill here — but the two lessons from doing it are worth keeping if you parse these tables yourself: read from the **right**, because a nil column prints `...` and a row whose leading figures are all nil gives a left-to-right scan nothing to anchor on; and anchor every extracted row on a figure the dataset already publishes, which makes the extraction self-checking rather than trusted.

**Adding a per-state split.** The same edit with `"axis": "recipient"`, using state ids from `vocabulary/finance-commission-shares.json`.

> One caution specific to this. Most Finance Commission grants are **conditional** — states draw them only by meeting eligibility — so an award's state-wise table shows what a state was _entitled_ to, not what it got. For 2024-25, local body grants were awarded ₹75,453 crore against ₹60,522.07 crore released. Only post-devolution revenue deficit grants match exactly, which is why only they carry a split. If your numbers don't reconcile, that is the finding — not an obstacle to work around.

**Saying what a line is.** `vocabulary/line-items.json`, keyed by fact id, written once and applied to every period. Two fields, and the difference between them is what has to be cited:

- **`summary`** — one short line: **the actual schemes and institutions this demand funds**, so a reader recognises something. "Scholarships and welfare schemes for religious minorities" describes half the government and connects with nobody; "PM Jan Vikas Karyakram in minority-concentration districts, scholarships, and the minorities development finance corporation" tells you what is really there. Naming real things makes this a claim about a demand's contents, so it is **cited** like everything else — read the names off the demand's own Notes rather than recalling them. This is what a row shows.
- **`spentOn`** — the longer, itemised account of what the money bought, with published amounts. **Must be cited**, because it quotes figures. This is what an _opened_ line shows, under its summary.

Keep summaries under about 160 characters. A row that wraps to four lines stops being scannable, which defeats the point.

**Saying what a line is actually spent on.** The `spentOn` half of the same file. A budget head is named for accountants — "Capital Outlay on Defence Services" tells a taxpayer nothing — and this is the sentence that fixes that. The source is the demand's own Notes on Demands (`doc/eb/sbe<N>.pdf`), which itemise it with amounts.

House style, because this is the one field where prose could drift into opinion:

1. **Name the biggest sub-items and their figures.** "₹44,365 crore on aircraft and aero engines" is concrete and cannot be spun. "Modernising our armed forces" is a press release.
2. **Say what the line does _not_ cover** when it is commonly confused. Capital Outlay on Defence Services is not salaries; Department of Revenue is mostly not tax administration.
3. **Name who actually receives the money.** Fertiliser subsidy is paid to fertiliser manufacturers and importers, not to farmers.
4. **State unflattering arithmetic where the dataset shows it — after checking it.** Defence pensions are _almost exactly_ the size of the defence equipment budget, not larger. Railway pensions are _smaller_ than civil pensions, not larger. Both of those were wrong on the first draft.
5. **Never justify, never praise.** Banned: vital, essential, empowering, transforming, modernising, landmark, historic.
6. **Describe the mechanism, not its merit.** Who pays whom, for what — and stop. That a road agency contracts construction out to private firms, that a subsidy is paid to manufacturers, that a company is state-owned: these are facts about how the money moves, not verdicts. Writing "which does not build anything itself — it contracts the work out to private firms" smuggles in a judgement about a delivery model, which is not this dataset's business and not what a taxpayer asked. Readers draw their own conclusions from accurate mechanics.

Rule 6 is the one that needs active guarding, because it is easy to write by accident. A first draft of these entries broke it five times in fifteen lines — implying private contracting was a finding, that fertiliser subsidy bypassed farmers, that credit support was not really farm support, and that MGNREGA workers had to "actually turn up".

Two or three sentences. Every entry carries a citation and is checked like any other figure; an entry naming a fact that does not exist fails the build.

**Adding a period.** Add `sections/<name>/<period>.json` and its source documents to `dataset/sources.json`. Nothing else for an id that already exists — its label is already in `section.json`. A period introducing a genuinely new fact id needs one new entry in `section.json`'s `lines`, same as any other new fact. Sections are discovered on disk. Note that a year's final actuals appear in the Expenditure Profile published **two Budgets later** — 2025-26 actuals will be in the 2027-28 profile.

**Adding a whole new view.** A second `@root` tree on a new partition axis, declared in `vocabulary/axes.json`. It must cover exactly the same facts as the existing ones.

## Rules the build enforces

Each has a test in `tests/test_validate.py` that deliberately breaks it.

| Rule                                                      | Why                                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A tree's parts sum exactly to what they decompose**     | The total and the parts usually come from _different documents_, so their agreement is corroboration — not arithmetic we did on ourselves                                                                                                                    |
| Two partitions of one total cover the same facts          | Makes the purpose and administrative views agree by construction                                                                                                                                                                                             |
| A fact has at most one partition below it                 | Two would leave its position in the tree undefined                                                                                                                                                                                                           |
| A fact appears at most once per tree                      | Otherwise the total counts it twice while still looking plausible                                                                                                                                                                                            |
| Every fact is placed by some tree                         | An unplaced fact is invisible in every view while looking authoritative                                                                                                                                                                                      |
| Fact ids unique within a section                          | Ids are the public contract and the cross-period identity; a collision merges two line items                                                                                                                                                                 |
| **One id, one label in every period**                     | An id _is_ the cross-period identity. `section.json`'s `lines` registry makes this structural for most sections; `label-drift` catches it for the rest — five files each individually valid still carried five names for one demand until this compared them |
| Every fact resolves to a label                            | From `section.json`'s `lines`, or its own inline `label` — a fact naming neither is a line with nothing to call it                                                                                                                                           |
| **One id, one group in every period**                     | A silent recategorisation makes a category's history untrue. Deliberate moves are fine — say so in that tree's `notes` and name the id                                                                                                                       |
| Groups declared in their axis vocabulary                  | Keeps categories comparable across periods, and labels in one place                                                                                                                                                                                          |
| Amounts land on whole rupees                              | Sub-rupee values cannot be represented exactly, and exact sums are the point                                                                                                                                                                                 |
| No figure cites an unverifiable source                    | Provenance you cannot check is not provenance                                                                                                                                                                                                                |
| Every checksummed source is cited by something            | An uncited document is dead weight that rots unnoticed                                                                                                                                                                                                       |
| An `award` source is corroborated by an independent total | An entitlement is not a record of payment                                                                                                                                                                                                                    |
| A `financing` section names what it finances              | So nothing adds it to money already counted elsewhere                                                                                                                                                                                                        |

## Style

- Ids are lowercase kebab-case and are permanent. Renaming one breaks every consumer; prefer adding over renaming.
- Amounts stay in the unit the source document prints them in. Do not pre-convert to rupees — the build does that exactly, and the raw figure stays checkable against the PDF.
- `locator` should be precise enough for a reviewer to find the row by hand: `"Statement 3, Demand No. 57"`, not `"Statement 3"`.
- Do not invent a label you cannot source. If a name is unknown, say so in the label and explain in `notes` — see the two 2021-22 records with unverified names for the pattern.

## Regenerating the JSON Schema

The Pydantic models in `wimtm_data/schema.py` are the source of truth. After changing them:

```bash
uv run wimtm-data schema-json
```

## Licensing your contribution

Data contributions are published under [CC BY 4.0](./LICENSE-DATA) and code contributions under [MIT](./LICENSE). By opening a pull request you agree to license your work on those terms.
