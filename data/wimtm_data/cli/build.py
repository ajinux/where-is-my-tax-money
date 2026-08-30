"""Ported from `scripts/build.ts`. Validate, resolve, and write the
published artifact to `dist/`."""

from __future__ import annotations

import dataclasses
import hashlib
import json
import sys

from .. import DataValidationError, build_dataset
from ..paths import ARTIFACT, DATASET_DIR, DIST_DIR


def run() -> int:
    dist_dir = DIST_DIR

    try:
        dataset, report = build_dataset(DATASET_DIR)
    except DataValidationError as error:
        print(str(error), file=sys.stderr)
        return 1

    dist_dir.mkdir(parents=True, exist_ok=True)

    # `exclude_unset` is not a stylistic choice: it is what makes an absent
    # optional field genuinely absent (matching TS's conditional spread)
    # rather than present as `null`. See resolve.py for the two places that
    # required deliberate handling — `parentId` (required, nullable, must
    # always serialize even when unset) and `Source.verification` (has a
    # schema default that TS's Zod bakes in permanently, so it must always
    # serialize too).
    payload = dataset.model_dump_json(exclude_unset=True)
    ARTIFACT.write_text(payload, encoding="utf-8")

    report_json = json.dumps(
        dataclasses.asdict(report), indent=2, ensure_ascii=False
    )
    (dist_dir / "report.json").write_text(report_json + "\n", encoding="utf-8")

    checksum = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    kb = round(len(payload.encode("utf-8")) / 1024)
    print(f"dist/dataset.v3.json  {kb} KB  sha256 {checksum}")
    for section in report.sections:
        print(f"  {section.section}/{section.period}  {section.factCount} facts")

    return 0


def main() -> None:
    sys.exit(run())


if __name__ == "__main__":
    main()
