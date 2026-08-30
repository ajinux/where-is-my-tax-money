"""Where everything lives, answered once.

Every command used to recompute the package root as
`Path(__file__).resolve().parent.parent.parent` — six copies of the same
`..`-counting, each of which silently pointed somewhere new if the file
holding it ever moved a level. That is exactly what happened when this
package stopped being `packages/data`.

The directories are named here instead, so a layout change is one edit and
a wrong path is an import error rather than a file quietly not found.

The split the names encode:

- `DATASET_DIR` is **authored**. Humans edit it; it is the point of the
  package. Everything under it is committed.
- `DIST_DIR` is **generated**. `wimtm-data build` and `wimtm-data
  schema-json` write it. It is committed too — consumers read the artifact
  without running the build — but nothing in it is edited by hand.
- `CACHE_DIR` is **downloaded**. `wimtm-data sources-fetch` fills it from
  the source manifest and it is never committed; the manifest's checksums
  are what make it reproducible.
"""

from pathlib import Path

#: `data/` — the package root, two levels above this file.
PACKAGE_DIR = Path(__file__).resolve().parent.parent

#: Hand-authored dataset: periods, vocabularies, and the source manifest.
DATASET_DIR = PACKAGE_DIR / "dataset"

#: The dataset manifest — version and revision notes.
DATASET_MANIFEST = DATASET_DIR / "dataset.json"

#: Named axes, group labels, line-item descriptions, commission shares.
VOCABULARY_DIR = DATASET_DIR / "vocabulary"

#: One directory per section, one file per period inside it.
SECTIONS_DIR = DATASET_DIR / "sections"

#: Every source document, with its URL and checksum.
SOURCES_MANIFEST = DATASET_DIR / "sources.json"

#: Build output: the artifact, the build report, and the JSON Schema.
DIST_DIR = PACKAGE_DIR / "dist"

#: The built artifact consumers read.
ARTIFACT = DIST_DIR / "dataset.v3.json"

#: JSON Schema generated from the Pydantic models.
SCHEMA_DIR = DIST_DIR / "schema"

#: Downloaded source documents. Not committed — fetched and checksummed.
CACHE_DIR = PACKAGE_DIR / ".cache" / "sources"
