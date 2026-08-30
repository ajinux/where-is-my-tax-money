# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project

`whereismytaxmoney.com` — showing an Indian taxpayer where their direct tax goes, as a proportional share of Union Government expenditure.

**One toolchain per directory, and they meet at a committed file.**

- **`data/`** — the open dataset and its build pipeline. Python, managed with [uv](https://docs.astral.sh/uv/). This is the work. It is designed to be open-sourced and contributed to by people who care about Indian public finance, with no knowledge of any website.
- **`web/`** — the site. Astro with React islands, static output, deployed to GitHub Pages. Node, its own `package.json`, no relationship to `data/`'s venv.

`web/` reads `data/dist/dataset.v3.json` and nothing else. That artifact is committed, so the site build never runs `uv` and the pipeline never learns that a website exists. Keep it that way: the interface between the halves is one file, not an import.

Top-level directories are flat. There is no `packages/` layer: that is an npm/pnpm **workspaces** convention — those tools glob `packages/*` to discover members — and it stopped meaning anything the moment the pipeline was ported to Python. Python and JS toolchains do not discover each other at any nesting depth, so the directory was pure ceremony costing one level of path. A frontend rewrite gets `web/` as a sibling of `data/`, and if it ever needs a JS workspace it can run one scoped inside itself.

The Astro/Preact frontend that used to live in `packages/web` was archived and then removed before this repo had version control, so it is **not** in git history — the current `web/` is a fresh build against a new design system, not a revival. It reintroduced a JS toolchain, on its own terms and scoped to itself: ruff and mypy targets did not change, and `data/` gained no dependency on Node.

## Commands

```bash
cd data
uv sync                             # installs the one venv
uv run wimtm-data validate          # check every dataset rule; reports all problems at once
uv run wimtm-data build             # write dist/dataset.v3.json
uv run pytest                       # fixtures + guards on the real committed data
uv run mypy wimtm_data/             # strict
uv run ruff check wimtm_data/ tests/       # the only linter

uv run wimtm-data sources-fetch     # download source PDFs, verify checksums
uv run wimtm-data sources-verify    # re-check already-downloaded documents
uv run wimtm-data schema-json       # regenerate JSON Schema from the Pydantic models

uv run pytest tests/test_validate.py   # single file
```

## Data layer architecture

`data/` separates content by **who writes it**, because the four kinds used to sit
as undifferentiated siblings and the dataset — the point of the package — was
4 entries out of 16, indistinguishable from build machinery:

```
data/
  dataset/        AUTHORED — humans edit this. It is the package.
  wimtm_data/     the pipeline; tests/ beside it
  dist/           GENERATED — build output, committed for consumers
  .cache/         DOWNLOADED — fetched PDFs, never committed
```

Everything authored lives under `data/dataset/`:

```
dataset.json                    version + revision notes
sources.json                    documents + checksums
vocabulary/axes.json            the named axes a tree may divide along
vocabulary/purpose.json         group labels for the purpose axis
vocabulary/line-items.json      what each budget head is actually spent on
vocabulary/finance-commission-shares.json
sections/union-expenditure/section.json
sections/union-expenditure/2020-21.json … 2025-26.json
sections/tax-devolution/section.json
sections/tax-devolution/2020-21.json … 2025-26.json
sections/tax-receipts/section.json
sections/tax-receipts/2020-21.json … 2025-26.json
sections/cess-earmark/section.json
sections/cess-earmark/2020-21.json … 2025-26.json
```

**`wimtm_data/paths.py` is the only place that answers "where is X".** Six commands
and three test modules each used to recompute the root as
`Path(__file__).resolve().parent.parent.parent` — nine copies of the same `..`-counting,
every one of which pointed somewhere new the moment a file moved a level. That is
precisely what happened when this package stopped being `packages/data`. Name the
directory in `paths.py`; a wrong path is then an import error rather than a file
quietly not found.

**There is one section shape, and every section uses it.** Expenditure, devolution, receipts and the cess earmark previously had four schemas, four loaders, four validators and four resolvers between them; they were all doing the same thing. Sections are discovered on disk — the manifest no longer lists periods, because four parallel year-lists were four things to forget.

Every section directory carries a **`section.json`** alongside its period files: the section's own label and description, and a `lines` map giving each fact id's label, written once for every period that carries it. This exists because the alternative — re-authoring a label in every period file — already caused six-way drift in `union-expenditure` (five mismatched names and one demand filed under two different purpose groups) before anything could see it; `section.json` removes the place that drift occurred rather than only detecting it.

A period file declares its `period`, `status`, and `perimeter`, then holds:

- **`facts`** — a flat list of published figures. A fact has an amount and a citation, and optionally a `basis` saying how its destination is decided. Facts are the only carriers of amounts. Keeping them flat rather than nested is why two views of the same money cannot disagree. A fact's `label` is optional and normally lives in `section.json` instead — set it inline only when the section has no registry entry for that id (a single-period section, where there is nothing to drift).
- **`trees`** — each declares what it decomposes (`of`: `@root` or a fact id) and along which `axis`. A tree may instead declare `derivedBy`, and its parts are generated at build time.

`wimtm_data/schema.py` holds the Pydantic models; each one is both the runtime validator and the static type, so there is no separate inference step to keep in sync. `wimtm_data/` is the pipeline: `load` (discover + shape-check) → `validate` (semantic rules) → `resolve` (compute bottom-up, emit flat `nodes`). `wimtm_data/cli/` holds the entry points, one per `uv run wimtm-data <verb>`.

### Invariants — do not weaken these

These are the reason the dataset is trustworthy. They are enforced in `wimtm_data/validate.py` and each has a deliberately-failing test.

- **The parts of a tree sum exactly to what they decompose.** This is _the_ rule, and it applies at every depth with no tolerance. It replaced five separately-written ones (lens roots, record components, per-state splits, cess fund totals, revenue/capital splits) that were all saying this. Its power is that a total and its parts nearly always come from **different documents**, so their agreement is corroboration between two independent publications rather than arithmetic performed on ourselves. Do not add a sixth special case — express it as a tree.
- **Groups carry no amount.** A group is a structural node; its subtotal is summed. There is nowhere in the format to write a subtotal that disagrees with its children.
- **Two partitions of the same total cover exactly the same facts.** This is what makes the purpose and administrative views agree by construction. A fact may have at most **one** partition below it, or its position in the tree is undefined.
- **Money conversion is exact, never floating-point multiplication** (`wimtm_data/units.py`). Figures are read straight into Python's `Decimal` from the source JSON text (`parse_float=Decimal` in `load.py`) rather than through a `float`, so there is no `73008.1 * 1e7 != 730081000000`-style rounding to guard against in the first place.
- **No figure may cite a source marked `verification: "unstable"`**, and conversely **every `checksum` source must be cited by something.**
- **An `award` source may back a settled figure only when corroborated.** A Finance Commission award states an _entitlement_; most such grants are conditional, so what states drew falls short of what they were awarded. An award-sourced tree must decompose a total published elsewhere, and the sum rule then supplies the evidence. Verified for 2024-25: revenue deficit grants match exactly (₹24,483 crore), while local body grants were awarded ₹75,453 crore against ₹60,522.07 crore released — which is why only the former carries a per-state split.
- **Perimeter is declared, not assumed.** `outside-union-spending` (devolution) and `financing` (the cess earmark) may never be summed with `union-spending`. This was prose in a contributing guide and prose stops nobody.
- **Derived amounts are never checked in.** A tree with `derivedBy` names a generator (`finance-commission-shares`, `divisible-pool`) that computes the parts from published inputs at build time. Generators publish the inputs they used in `derived.parameters` so a consumer can explain the figure.
- **Each period has its own source documents, and that is not redundancy.** An Expenditure Profile's _Actuals_ column reports the year that ended two years earlier, so 2020-21 comes from the 2022-23 Budget's profile and 2024-25 from the 2026-27 one.
- **There is no approval/review flag.** Review is PR review; merged to main means accepted.
- **The period count is not fixed.** "Show the latest five" is a consumer's decision.

### Conventions

- **Ids carry no year prefix** and are unique within a section file. A fact's id _is_ its cross-period identity — `demand-42` in two files is the same line item across years. There is no separate `comparableId`; there used to be, and two ids per record confused more than it helped. That identity is now **enforced** rather than merely asserted: `label-drift` and `group-drift` compare the periods of a section, because every other rule here validates one section in isolation and so could not see a demand carrying five different names across five individually-valid files. A deliberate recategorisation is allowed — name the moved id in that tree's `notes`, which exempts that id and nothing else.
- **`summary` and `spentOn` live in `vocabulary/line-items.json`, keyed by fact id, written once for all periods.** `summary` is one short line naming the **actual schemes and institutions** the demand funds — generic remits ("welfare schemes for minorities") describe half the government and connect with nobody, so name PM Jan Vikas Karyakram, Khelo India, Jal Jeevan Mission. That makes it a claim about a demand's contents, so it is **cited** from that demand's Notes on Demands like everything else; a demand's own `description` is generated boilerplate and says nothing. `spentOn` quotes published amounts and **must be cited**. A row shows the summary; opening it adds the `spentOn`. `uv run wimtm-data validate` prints described-line coverage per section — reported, not enforced, so a half-filled vocabulary still builds.
- **The `spentOn` half specifically:** It says what a budget head actually buys, because the head's own label is written for accountants. House style is in CONTRIBUTING and the point of it is to stay factual: name the biggest sub-items with their figures, name who receives the money, state unflattering arithmetic only after checking it, and never justify or praise. **Describe the mechanism, not its merit** — that a highway agency contracts work to private firms, or that a company is state-owned, is a fact about how money moves, not a verdict. This is a taxpayer's view of public money, not an argument about how services should be delivered. Groups get a composition line computed from the tree instead — no document describes a grouping we invented.
- **Labels live only in one place, written once.** Group labels live in the vocabularies rather than on each year's tree, where they drifted the first time a category was renamed, silently, in five files. Fact labels are the same lesson applied one layer down: they live in that section's `section.json`, not re-authored per period — which is exactly where they had already drifted six ways before `label-drift`/`group-drift` could compare the files and see it.
- A `classification` axis (revenue/capital) describes the same money by an attribute. It resolves to `classifications` on the node, never to children — rendering it as a destination would be wrong. Its parts are usually inline (`{ group, amount }` on the tree itself, with one shared `cite`), because Revenue/Capital/Total are columns of one row rather than entries in a second document — there is nothing for a promoted-to-fact part to corroborate against.
- Amounts stay in the unit the source prints (`{ value, unit }`); the build converts exactly.
- Periods are `2024-25` — no `FY` prefix.
- **Ruff is the only linter** (`uv run ruff check wimtm_data/ tests/`), at `line-length = 100` because the codebase already respected that and reflowing validation code for a style rule is churn with real risk. It used to reach outside the package to cover `prototype/`, which had no linter or type checker of any kind — that is how a Streamlit cache that never invalidated survived unnoticed. The prototype is gone, so the target list is now just what lives here. mypy stays scoped to `wimtm_data/`, where strict typing earns its cost.

### Adding things

Every contribution is the same edit shape, checked by the same rule:

| To do this            | Do this                                                            |
| --------------------- | ------------------------------------------------------------------ |
| Add a period          | New file under `sections/<name>/<period>.json`                     |
| Break a figure down   | Add facts, add a `tree` with `of` pointing at it                   |
| Add revenue/capital   | A tree with `axis: "account-class"` and inline `parts` — see below |
| Add a per-state split | Same, with `axis: "recipient"` — it must reconcile                 |
| Add a third view      | A second `@root` tree on a new partition axis                      |

## Known data gaps

Real limitations, documented in `data/README.md` — good first contributions, not bugs to hide:

- ~~The administrative view is flat.~~ **Grouped into 56 ministries**, and the grouping is _read_ rather than invented: every Notes on Demands document prints its ministry as the heading above the demand number, so the mapping is published per demand. Group descriptions are composition lines listing the departments each ministry contains — the same reason. One caveat recorded in `vocabulary/administrative.json`'s notes: the structure is the one the 2026-27 Budget publishes, applied to every period so a demand keeps one place across years, which `group-drift` requires. A machinery-of-government change that moved a demand between ministries in an earlier year is therefore not reflected.
- ~~Devolution exists for 2024-25 and 2025-26 only.~~ **All six years now have devolution and tax receipts**, so every year offers the full journey. **The Fourteenth Finance Commission note here was wrong** and is worth remembering as a caution: 2020-21 is not a Fourteenth Commission year — that award ended with 2019-20. It falls under the Fifteenth Commission's _separate single-year report for 2020-21_, which has its own horizontal shares (Andhra Pradesh 4.111 against the 2021-26 award's 4.047) and reaches 41 per cent by cutting one point off the Fourteenth's 42 because the reorganisation of Jammu and Kashmir moved an estimated 0.85 per cent of the pool to a union territory. 42 per cent appears in that report only as the level being adjusted, which is presumably how the note went wrong.
- **Statement 15 is published rotated.** Every archived Expenditure Profile prints the reserve-fund names and the RE/BE markers turned 90 degrees, so `extract_text()` scrambles or drops them and a text-only parse cannot tell which fund a block belongs to, or whether it is the revised estimate. Read them as geometry instead (`chars` with `upright=False`), and note two traps found the hard way: the rotated label is _centred_ on its rows, so a block's first row and its `Total` row both fall outside the label's own extent; and the block appearing first in the text stream is **not** reliably the RE — in 2021-22 it was the BE. Serial numbers are per-scheme in recent editions and per-department in older ones, so they cannot anchor the row name either.
- **A generator's source is a citation and is checked like one** (`_check_generator_sources`). A `derivedBy` tree writes no citation in its section file — the source arrives from the award it names, attached at resolve time — so for a long while it reached the published artifact unchecked. That is how four `actual-final` devolution years came to cite a `budget-estimate` document from a year none of them are: the shares were right, the provenance was not, and `estimate-cited-as-actual` never saw it. Together with `award-period-mismatch` this is the second rule a generator has slipped past, so treat it as the standing lesson: **derived output is not exempt from the checks its inputs would face.**
- **A website is the one claim here no checksum protects.** Ministries and departments carry an optional `url` (on the administrative vocabulary's groups, and on each `lines` entry in a section.json). A live site moves or dies where a document's bytes do not, so it is held to a different but explicit bar: a candidate is written only once the page it serves **names itself** as that body — its own `<title>`, or its full name in the page. That is the same corroboration shape used everywhere else, just against a weaker witness. **An absent `url` means "not corroborated", never "has no website"**, and roughly a third of the demand lines are accounting heads (Interest Payments, Repayment of Debt) with no site to find. Do not fill these in from recollection: the first domain tried that way, `finmin.nic.in`, does not resolve.
- **A document's title is its publication year, not its data year**, and the two are usually different — 2023-24's actuals live in the Budget 2025-26 documents. Any UI that prints only the title will look like it is showing the wrong year, so print the period the figures are *for* beside it. An `award` source is the exception and must not be given a year at all: it states an entitlement across an award period, so its `period` field is arbitrary.
- **A derived split has no second document to disagree with**, which is why `award-period-mismatch` exists. `finance-commission-shares` picks an award by `awardId` alone; naming one whose award period does not cover the year produced a complete, plausible, exactly-summing state split from the wrong percentages, and nothing caught it. The rule makes each award's already-recorded `fromPeriod`/`toPeriod` mean something. Treat this as the general lesson for generators: where the sum rule cannot corroborate, an explicit rule has to.
- ~~The revenue/capital split is absent.~~ **Complete for all six years**, every demand closing exactly to the rupee against Statement 3's own Total column — verified before writing, not assumed. A classification tree's parts are inline (`{ group, amount }`), not promoted to facts: Revenue, Capital and Total are three columns of one row of one document, so there is no second document for a part to corroborate against, and inventing 1,200 permanent ids across the corpus would buy nothing. The last three years were believed blocked on OCR of a scanned Statement 3; they were not. All the cached PDFs carry a text layer. What actually hid 2020-21 was a **row-layout difference**, not a missing one: the 2022-23 edition numbers its rows `1. Department of…` where later editions print `Demand No. 1`, so a single regex found nothing and the year looked scanned. Two lessons worth keeping — read from the _right_ when parsing these tables (a nil column prints `...`, so a row whose leading figures are all nil gives a left-to-right scan nothing to anchor on), and anchor every extracted row on a figure the dataset already publishes, which makes the extraction self-checking rather than trusted.
- **A classification part may be negative; a fact's amount may not** (`SignedAmount` vs `Amount` in `schema.py`). Statement 3 publishes _net_ capital expenditure, and a body whose capital recoveries exceed its outlay nets out below zero — the Election Commission's capital column is -5.00 crore in 2022-23 and -30.05 crore in 2024-25. Revenue + Capital still equals the Total exactly in both, so the sum rule is untouched. Keep this relaxation narrow: it exists because a source prints the figure, and it applies to parts of a decomposition only.
- **2025-26 is revised estimates, not actuals**, and is the only unsettled year. It is read from the Revised Estimates 2025-26 columns of the same Budget 2026-27 documents that supply 2024-25's actuals — the reason the split above came free is that those documents are text-extractable where the older scanned ones are not. When the 2027-28 Budget publishes Actuals 2025-26 (around February 2027), this year should be re-read from that edition and its `status` changed to `actual-final`, which will also switch on the two rules that currently do not engage for it (`estimate-cited-as-actual` and the award corroboration rule).
- ~~Two 2021-22 facts (Demands No. 27 and 64) have OCR-damaged names.~~ Resolved, and how it was found is the point: it was actually **four** damaged labels across two periods (Demands 27, 50 and 64 in 2021-22; Demand 62 truncated in 2020-21), plus Demand 34 inconsistently parenthesised. They did not need reading off a PDF — the other four year files already printed a sourced name for the same demand numbers, so the fix was to adopt what four independent profiles corroborate. Nothing could see this until `label-drift` compared the files, because each one was individually valid. The OCR damage is recorded in those two sections' `notes`.
- No state-wise split exists for the other Finance Commission grants or the ₹1.49 lakh crore of capital-investment loans. Award tables exist but do not reconcile to what was released; the loans' full-year 2024-25 state split is not published anywhere yet. Do not attach either — `sum-mismatch` will stop you, which is the point.

## Legacy

**`legacy/`, `scripts/` and `tools/` are gone, and git history is where they live now.** They were kept "for reference" while the repo had no version control, which made deleting anything irreversible. It has version control now, so the reference copy is `git log` and a directory of dead code is just a thing that looks live.

What went, and why each was provably dead rather than merely old:

- `legacy/*.ts` and `scripts/migrate-v1-to-v2.ts` — the v1/v2 TypeScript pipeline. There is no JS toolchain left to run them, and the Python port was verified byte-for-byte identical on the full dataset before the TS was deleted.
- `legacy/expenditure.v1.json`, `legacy/latest-candidate.v1.json` — the v1 dataset. Checked before deleting rather than assumed: all 507 v1 records have a v3 counterpart under the year-prefix-stripped id, and v3 carries more (121 facts in 2024-25 against v1's 101) across four sections instead of one.
- `scripts/migrate-v2-to-v3.py` — a one-shot transform, already run, that can never meaningfully run again.
- `tools/extract_expenditure_pdfs.py` — the maintainer-only PDF/OCR extractor. Both its input path (`tmp/pdfs`) and its output path (`data/reviewed/`) had already stopped existing, it emitted the superseded v1 shape, and its stated premise — that the 2020-21 and 2021-22 Statement 3 PDFs are image-based and need OCR — is recorded **as wrong** under Known data gaps. Keeping it would have pointed the next reader down a path already established as a dead end.
- `dist/dataset.v2.json` — 806 KB referenced by nothing.

Deleting the extractor also took `pdfplumber` and `pypdfium2` out of the package's runtime dependencies; it was their only consumer, so a package whose job is reading JSON no longer pulls a PDF stack. If PDF extraction returns — the 2027-28 Budget re-read of 2025-26 is the likely occasion — `uv add --dev pdfplumber` is one line, and the technique worth keeping is already written down under Known data gaps rather than encoded in that file.

The build pipeline itself was TypeScript (Zod schemas, vitest) through schema v3, then ported to Python (Pydantic, pytest) — same model, same rules, verified byte-for-byte identical on the full dataset before the TypeScript implementation was deleted. `packages/data` stopped being an npm workspace member at that point; it has its own `pyproject.toml` now. npm went away entirely a little later, when `packages/web` was archived out of the repo — and the empty `packages/` layer went with it, leaving `data/` flat at the root.
