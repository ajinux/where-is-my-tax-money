"""Ported from `scripts/validate.ts`. Check the dataset and print a
summary. Writes nothing."""

from __future__ import annotations

import sys

from .. import DataValidationError, build_dataset
from ..paths import DATASET_DIR
from ._format import crore


def run() -> int:
    try:
        _, report = build_dataset(DATASET_DIR)
    except DataValidationError as error:
        print(str(error), file=sys.stderr)
        return 1

    print(f"dataset {report.datasetVersion}, {report.sourceCount} sources\n")

    current = ""
    for section in report.sections:
        if section.section != current:
            current = section.section
            print(f"{section.section}  ({section.perimeter})")
        total = f"₹{crore(section.totalRupees)} crore"
        reconciles = (
            "reconciles to published total"
            if section.totalIsPublished
            else "summed from parts"
        )
        print(
            f"  {section.period}  {section.factCount:>3} facts"
            f"  {section.describedCount:>3}/{section.factCount} described"
            f"  {total:>22}"
            f"  {reconciles}"
            f"  [{', '.join(section.axes)}]  {section.status}"
        )

    print("\nall checks passed")
    return 0


def main() -> None:
    sys.exit(run())


if __name__ == "__main__":
    main()
