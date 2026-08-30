# Union Government of India: expenditure by fiscal year

An open dataset of what the Union Government of India actually spent, broken down two ways: **by purpose** (what the money went on) and **by administration** (which department spent it), with every figure traced to the document it came from.

Six fiscal years, 2020-21 through 2025-26. Over 1,500 sourced figures from 131 government documents, reconciling to the rupee against the Ministry's own published totals.

```bash
uv sync                        # pydantic, pytest, mypy, ruff
uv run wimtm-data validate     # check every rule
uv run wimtm-data build        # write dist/dataset.v3.json
```

## What makes it trustworthy

Three properties are enforced by the build, not by convention.

**Subtotals cannot lie.** Only leaf records carry an amount. Every category and total is summed from what is underneath it. There is nowhere in the format to write a subtotal that disagrees with its children.

**The two views cannot drift apart.** Each record sits exactly once in the purpose tree and exactly once in the administrative tree, and that is checked. So the two views necessarily total the same, and nothing can be double-counted or dropped from one of them.

**Every figure reconciles to an official total.** Each year's leaves must sum to the root total in the Ministry's Statement 1, exactly, with no tolerance. All six years do.

The sum rule sounds like bookkeeping. It is where the trust comes from: **a total and its parts almost always come from different documents.** A demand's total is printed in Statement 3 and its components in the Notes on Demands. When they agree to the rupee, two independent government publications have corroborated each other. When they do not, the build says so instead of shipping it.

Money is converted to integer rupees by shifting the decimal point on the digits, never by floating-point multiplication. `73008.1 * 1e7` is not exactly `730081000000`, and a dataset resting on exact sums cannot afford that drift.

## Layout

```
dataset/                         AUTHORED: everything a contributor edits
  dataset.json                   version + revision notes
  sources.json                   every source document, with URL and checksum
  vocabulary/                    axes, purpose groups, ministries, line items,
                                 Finance Commission shares
  sections/union-expenditure/    section.json + one file per period
  sections/tax-devolution/       …
  sections/tax-receipts/         …
  sections/cess-earmark/         …

wimtm_data/                      the build pipeline; tests/ beside it
dist/                            GENERATED: the artifact and its JSON Schema
.cache/sources/                  DOWNLOADED: source PDFs (never committed)
```

The split is by **who writes it**. To correct a figure or describe a budget head, everything you need is under `dataset/`. `dist/` is written by `wimtm-data build` and committed so consumers can read it without running anything.

One file per period, so an amount correction is a single-file diff. **All four sections use the same shape**; they are not four formats but four uses of one. Each section directory also carries a `section.json` holding each fact's label, written once rather than re-typed per period, which is how one demand once ended up with five different names.

## The model

**A fact** is a published figure, and the only thing carrying an amount.

```jsonc
// sections/union-expenditure/2024-25.json
{
  "id": "demand-25",
  "amount": { "value": 65159.25, "unit": "crore-rupees" },
  "cite": [
    {
      "sourceId": "mof-2024-25-statement-3",
      "locator": "Statement 3, Demand No. 25, Actuals 2024-25, Total column",
    },
  ],
}
```

**A tree** decomposes something into facts along a named axis:

```jsonc
{
  "of": "@root",
  "axis": "purpose",
  "children": [
    { "group": "education-skills-and-research", "children": ["demand-25", "demand-26"] },
  ],
}
```

> **The parts of a tree must sum exactly to what they decompose.**

**A section** is one period of one thing, declaring its `period`, `status` and `perimeter`, and holding facts and trees.

That is the whole model, and it is the same at every depth: a year split into purpose categories, a demand into the components its Notes on Demands publish, a component into the states that received it. Facts stay in one flat list; only trees nest. That is why two views of the same money cannot disagree, because no amount is written twice.

Groups carry no amount, and there is nowhere to write one. Ids carry no year prefix: `demand-25` in the 2023-24 and 2024-25 files is the same line item, followed through time.

## What each line is

Every budget head carries one short line saying what it is, 135 in all, covering every demand in every year:

> **Ministry of Youth Affairs and Sports.** Khelo India, the Sports Authority of India, athlete training, and the Nehru Yuva Kendra youth network.

Without it a demand describes itself as "Actual expenditure recorded under Demand No. 49", which is true and useless. The rule is to **name real things**: "welfare schemes for religious minorities" would fit half the government. Because that is a claim about what a demand contains, every line is cited to the demand's own Notes on Demands.

For the fifteen largest, `vocabulary/line-items.json` also carries a longer account of what the money bought:

> **Department of Fertilisers.** Subsidy paid to fertiliser companies, not to farmers. ₹1,03,320 crore goes to domestic urea manufacturers, ₹21,000 crore to urea importers, and ₹52,810 crore to producers and importers of phosphatic and potassic fertilisers.

That covers about 81% of 2024-25 spending. The rest show nothing rather than an apology. The writing rules are in [CONTRIBUTING](./CONTRIBUTING.md) and exist to stop the field becoming editorial: name the biggest sub-items and their figures, say what the line does **not** cover where it is commonly confused, name who receives the money, never justify or praise. Concreteness is what keeps it neutral. "₹44,365 crore on aircraft and aero engines" cannot be spun the way "modernising our armed forces" can.

## The other three sections

**Tax receipts** is gross tax revenue: everything the union collected before anything is devolved or spent. It is the denominator that turns a devolution total into a share of tax collected. Its one tree splits it into the divisible pool and the part states get no share of.

**Devolution** is the states' constitutional share, all six years.

```
States' share of central taxes    ₹12,86,885 cr   ← 41% of the divisible pool, 2024-25
├─ Uttar Pradesh   17.939%          ₹2,30,854.30 cr
├─ Bihar           10.058%          ₹1,29,434.89 cr
├─ Karnataka        3.647%             ₹46,932.70 cr
└─ … 25 more
```

The nesting makes the claim precise: of the 41% going to states, Karnataka gets 3.647%, so 1.495% of the pool. This is a separate section because devolution is the states' **own money by right**, deducted from receipts *before* the union spends anything. Its perimeter is `outside-union-spending` and a rule refuses to sum it with expenditure. It deliberately excludes money the union sends states for its own schemes, which is already counted inside the expenditure dataset.

The file on disk is only a cited root total plus a generator naming the award; the 28 per-state amounts are **computed at build time** from `vocabulary/finance-commission-shares.json` and exist only in `dist/`. Largest-remainder apportionment makes them sum to the total to the rupee. Two caveats: actual releases can deviate from the exact share because of arrears, so this is the legal basis for the split rather than a reconciliation of what moved; and 2020-21 is not a Fourteenth Commission year, as this repo once claimed. That award ended with 2019-20. 2020-21 falls under the Fifteenth Commission's separate single-year report, with its own shares.

**The cess earmark** records what the 4% Health and Education Cess may finance, all six years.

```
Health and Education Cess, 2025-26               ₹1,08,271.88 cr
├─ Prarambhik Shiksha Kosh                          ₹48,600.00 cr
├─ Madhyamik and Uchchatar Shiksha Kosh             ₹31,271.26 cr
└─ Pradhan Mantri Swasthya Suraksha Nidhi           ₹28,400.62 cr
```

Ordinary tax enters the Consolidated Fund and may finance anything Parliament votes. A cess is levied for a stated purpose, credited to a named reserve fund, and may finance only that fund's schemes. It is separate for two reasons. Its schemes are **already counted** through the department demands, so adding these amounts would double-count; its perimeter is `financing` and a rule refuses to sum it with union spending. And it **can never be actuals**: Statement 15 is the only document naming these schemes and publishes estimates only, so a rule makes `actual-final` unreachable. Every cess period is therefore a revised estimate, even where the matching expenditure year is settled.

Each fund carries the subtotal Statement 15 prints, decomposed into its schemes, which are summed and must agree. All three currently match to the paisa. What this does **not** say is what the cess collected: what the funds carry and what the levy raised are different numbers, and only the one with a document behind it is asserted here.

## Sources

Source documents are large government PDFs and are not committed. `dataset/sources.json` records each one's canonical URL and SHA-256.

```bash
uv run wimtm-data sources-fetch    # download and verify
uv run wimtm-data sources-verify   # re-check what is downloaded
```

All 131 documents download from their canonical URLs and match their checksums. The manifest carries 136 entries against 131 files, because a Budget publication prints several years in parallel columns: the 2025-26 entries share a file with their 2024-25 siblings and differ only in which column they read.

Per year: **Statement 1** for the authoritative root total, **Statement 3** for the per-demand line items, **Budget at a Glance** for devolution and gross tax revenue, **Notes on Demands** wherever a demand is broken down, and **Expenditure Profile Statement 15** for the cess funds.

**Each year needs its own documents.** An Expenditure Profile's *Actuals* column reports the fiscal year that ended two years earlier, so 2020-21 comes from the 2022-23 edition and 2024-25 from the 2026-27 one. No single publication contains final actuals for five years. Taking them all from the newest document would mean one year of actuals and four of estimates.

A related trap: **a document's title is its publication year, not its data year.** Any interface printing only the title looks like it is showing the wrong year, so print the period the figures are *for* beside it.

**A source is either evidence or a cross-reference**, and the build holds each to the opposite standard. `verification: "checksum"` is a static file: re-downloading must reproduce its SHA-256, and something must cite it, because an uncited source is a document nobody depends on, quietly rotting until its URL moves. `verification: "unstable"` is a server-rendered page whose bytes differ per request, so nothing may cite it. There is deliberately no third state where a figure quietly depends on something unverifiable.

The newest year's documents sit at the unprefixed `indiabudget.gov.in/doc/` path, which always serves the current budget. When the 2027-28 Budget is presented those checksums will stop matching, which is the signal to repoint them at the archived copy. `sources-fetch` refuses to overwrite on a mismatch.

## Known gaps

Each is a good first contribution.

- **No state-wise split for the other Finance Commission grants**, or for the ₹1.49 lakh crore of capital-investment loans. Award tables exist but do not reconcile to what was released, and the loans' 2024-25 split is not published anywhere. The sum rule will refuse either, which is the honest outcome.
- **`spentOn` is written once for all periods** but quotes one year's figures, so a 2020-21 row shows the same "₹66,121 crore under PM-Kisan" as the 2024-25 row, against a different total. Making it period-scoped is a schema change and deserves its own decision.
- **2025-26 expenditure is revised estimates.** The most recent figure published, but the one expenditure year not settled. Re-read it from the 2027-28 Budget when that lands.
- **A machinery-of-government change is not reflected.** The administrative grouping is the structure the 2026-27 Budget publishes, applied to every period so a demand keeps one place across years. A demand that moved between ministries earlier is shown where it sits now.

Two closed gaps are worth keeping as cautions. The revenue/capital split was recorded as blocked on OCR of a scanned document; the documents were not scanned, and what actually hid 2020-21 was a row-layout difference. "We tried and it needs OCR" had aged into "it is scanned" and nobody re-checked. And four OCR-damaged demand labels went unnoticed for as long as each period file was only ever validated alone; comparing periods against each other found them, and four other years already carried a sourced name for each.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Licence

The **data**, meaning everything under `dataset/` and the built artifact in `dist/`, is [CC BY 4.0](./LICENSE-DATA). The figures are Government of India public records; the purpose taxonomy and the arrangement are this project's work. Attribute both.

The **code** in `wimtm_data/` is [MIT](./LICENSE).
