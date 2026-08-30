"""Ported from `scripts/emit-json-schema.ts`. Generate JSON Schema from the
Pydantic models, so contributors get editor completion and CI gets a
language-neutral contract.

Uses Pydantic's own `model_json_schema()` rather than reproducing Zod's
`z.toJSONSchema(..., target: 'draft-7')` output draft-for-draft — these
files are documentation/tooling, not part of the artifact the verification
gate compares byte-for-byte, so a modern JSON Schema draft is a fine
substitute for the exact one TS emitted.
"""

from __future__ import annotations

import json

from pydantic import BaseModel

from ..paths import SCHEMA_DIR
from ..schema import (
    AxisVocabulary,
    DatasetManifest,
    FinanceCommission,
    GroupVocabulary,
    LineItemVocabulary,
    ResolvedDataset,
    SectionDefinition,
    SectionFile,
    SourcesManifest,
)

TARGETS: list[tuple[str, type[BaseModel], str]] = [
    (
        "section",
        SectionFile,
        "One period of one section: its facts and the trees that decompose "
        "them. Every section in the dataset uses this.",
    ),
    (
        "section-definition",
        SectionDefinition,
        "A section's own label and description, and its facts' labels — "
        "written once and shared by every period file in that section's "
        "directory.",
    ),
    ("dataset-manifest", DatasetManifest, "The dataset index (dataset.json)."),
    (
        "sources-manifest",
        SourcesManifest,
        "Source documents and their checksums.",
    ),
    (
        "axis-vocabulary",
        AxisVocabulary,
        "The named axes a tree may be divided along.",
    ),
    (
        "group-vocabulary",
        GroupVocabulary,
        "A named set of group ids with their labels.",
    ),
    (
        "line-item-vocabulary",
        LineItemVocabulary,
        "What each budget head is actually spent on, keyed by fact id.",
    ),
    (
        "finance-commission",
        FinanceCommission,
        "Fixed horizontal devolution shares.",
    ),
    ("resolved-dataset", ResolvedDataset, "The built artifact in dist/."),
]


def run() -> None:
    out_dir = SCHEMA_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    for name, model, description in TARGETS:
        json_schema = model.model_json_schema()
        payload = {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "title": name,
            "description": description,
            **json_schema,
        }
        path = out_dir / f"{name}.schema.json"
        path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"  dist/schema/{name}.schema.json")


def main() -> None:
    run()


if __name__ == "__main__":
    main()
