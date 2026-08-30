<div align="center">

<img src=".github/assets/logo.svg" width="88" height="88" alt="">

<h1>whereismytaxmoney.com</h1>

**Where an Indian taxpayer's income tax actually goes, shown as a proportional share of what the Union Government really spent, traced to the document every figure came from.**

[![Data licence: CC BY 4.0](https://img.shields.io/badge/data-CC%20BY%204.0-2b7489)](./data/LICENSE-DATA)
[![Code licence: MIT](https://img.shields.io/badge/code-MIT-blue)](./data/LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-3776ab)](./data/pyproject.toml)
[![Node 22](https://img.shields.io/badge/node-22-339933)](./web/package.json)

[The dataset](./data) · [The site](./web) · [Contributing](./data/CONTRIBUTING.md)

</div>

---

## What this is

Two things that are useful separately, which is why they are kept apart:

| | | |
|---|---|---|
| **[`data/`](./data)** | An open dataset of Union Government expenditure by fiscal year, broken down by purpose and by department, every figure cited to a published government document | Python · [uv](https://docs.astral.sh/uv/) |
| **[`web/`](./web)** | The site. You enter what you paid in income tax; it shows where that money went | Astro · React · static |

**Six fiscal years, 2020-21 through 2025-26.** Over 1,500 sourced figures drawn from 131 government documents, across 56 ministries and 11 purpose categories, reconciling to the rupee against the Ministry of Finance's own published totals. Five years are settled actuals; 2025-26 is revised estimates and is labelled as such everywhere it appears.

The dataset stands on its own. It publishes its own schema and licence, has no dependency on any frontend, and is meant to be useful to anyone working on Indian public finance, not just to this website.

## Why

A taxpayer in India is never shown a bill. You can find out what the government spent in total, and you can find out what you paid, but nobody puts the two together and tells you what your ₹1,20,000 bought.

The figures to answer that are public. They are also spread across Expenditure Profile statements, Notes on Demands for Grants, Budget at a Glance and Finance Commission awards, published as hundreds of pages of PDF, in a vocabulary written for accountants. "Capital Outlay on Defence Services" is a true label and a useless one.

This project does the reading. It turns those documents into a dataset a machine can check, and puts one number in front of a reader.

Two things it refuses to do, because they are what make it worth trusting:

- **It does not estimate.** Every amount comes from a published document, cited by statement and column. Where a figure is derived, the method and its inputs are published alongside it.
- **It does not smooth over disagreement.** When two documents do not reconcile, the build fails rather than picking one.

## How it works

```
 government PDFs
        │
        ▼
  data/dataset/  ──►  validate + build  ──►  data/dist/dataset.v3.json
  (authored JSON)                            (generated, committed)
                                                         │
                                                         ▼
                                                       web/  ──►  static site
```

The first arrow is the only manual step. A contributor reads a government PDF and writes the figure into `data/dataset/`, with a citation naming the statement and column it came from. Everything after that is checked by machine.

**The two halves meet at exactly one committed file.** `web/` reads `data/dist/dataset.v3.json` and nothing else. Because that artifact is committed, the site build never runs `uv`, and the pipeline never learns that a website exists. There is no import across the boundary, and no workspace tying the toolchains together.

### What makes the dataset trustworthy

Only leaf records carry an amount, so every category and total is summed from what is underneath it. **The parts of a tree must sum exactly to what they decompose**, at every depth, with no tolerance.

That one rule is where the trust comes from, because a total and its parts almost always come from *different documents*: a demand's total from Statement 3, its components from that demand's Notes on Demands. When they agree to the rupee, two independent government publications have corroborated each other. When they do not, the build fails.

[The dataset README](./data/README.md) explains the model and the rest of the invariants.

## Setup

**Prerequisites:** [uv](https://docs.astral.sh/uv/getting-started/installation/) and Python 3.10+ for the dataset; Node 22+ for the site. Neither half needs the other's toolchain installed.

```bash
git clone <this repository>
cd wimtm
```

### The dataset

```bash
cd data
uv sync                          # one venv: pydantic, pytest, mypy, ruff

uv run wimtm-data validate       # check every rule; reports all problems at once
uv run wimtm-data build          # write dist/dataset.v3.json
uv run pytest                    # fixtures and guards against the real data
```

Source documents are large government PDFs and are not committed. To work with them:

```bash
uv run wimtm-data sources-fetch    # download, verify every SHA-256
uv run wimtm-data sources-verify   # re-check what is already downloaded
```

### The site

```bash
cd web
npm install

npm run dev                      # transform the dataset, then serve
npm test                         # allocation maths, against fixtures from the Python
npm run build                    # transform, typecheck, build to dist/
```

`npm run dev` and `npm run build` each regenerate the site's view models from the committed artifact first, so a fresh clone needs no extra step and no Python.

## Repository layout

```
data/                     the dataset and its build pipeline
  dataset/                AUTHORED: everything a contributor edits
    sources.json          every source document, with URL and SHA-256
    vocabulary/           axes, purpose groups, line-item descriptions
    sections/             one directory per section, one file per period
  wimtm_data/             the pipeline: load → validate → resolve
  dist/                   GENERATED: the built artifact, committed for consumers
  .cache/                 DOWNLOADED: source PDFs, never committed

web/                      the site
  src/components/         React island
  src/lib/                allocation maths, view-model building
  scripts/                dataset transform, and the Python the TS is checked against
  tests/

.github/workflows/        CI: data.yml validates the dataset, web.yml builds and deploys
```

Top-level directories are flat. There is no `packages/` layer: that is an npm workspaces convention, and Python and JavaScript toolchains do not discover each other at any nesting depth.

## Contributing

**Corrections are the most valuable contribution here.** If a figure is wrong, or a department is filed under the wrong purpose, that is worth more than a new feature.

Start with [`data/CONTRIBUTING.md`](./data/CONTRIBUTING.md), which covers the house style in detail. In outline:

| To do this | Do this |
|---|---|
| Correct a figure | Edit one file under `data/dataset/sections/<section>/<period>.json` |
| Add a fiscal year | Add a new period file to each section |
| Break a figure down | Add facts, and a tree whose `of` points at the figure |
| Describe a budget head | Add an entry to `data/dataset/vocabulary/line-items.json` |
| Add a per-state split | A tree on the `recipient` axis. It must reconcile |
| Work on the site | See [`web/README.md`](./web/README.md) |

Two ground rules, both machine-checked: **every figure carries a citation** naming the statement and column it was read from, and **nothing derived is checked in**, because a tree that declares a generator computes its parts at build time.

Before opening a pull request:

```bash
cd data && uv run wimtm-data validate && uv run pytest
cd ../web && npm test && npm run build     # only if you touched web/
```

[Known gaps](./data/README.md#known-gaps) are documented rather than hidden, and are good first contributions.

## Licence

The **data**, everything under `data/dataset/` and the built artifact in `data/dist/`, is published under [CC BY 4.0](./data/LICENSE-DATA). The underlying figures are Government of India public records; the purpose taxonomy and the arrangement of the data are this project's work. Attribute both.

The **pipeline code** in `data/wimtm_data/` is [MIT](./data/LICENSE).

## Acknowledgements

Every figure here was published by the **Ministry of Finance, Government of India**, in the Union Budget documents and Expenditure Profile statements listed in [`data/dataset/sources.json`](./data/dataset/sources.json). This project reads those documents; it does not produce the numbers.
