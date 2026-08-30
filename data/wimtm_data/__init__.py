"""Union Government of India expenditure — the dataset build pipeline.

Load, check, and resolve the dataset in one call. Semantic validation runs
before resolution because resolution assumes the rules already hold — for
instance, that every tree reference points at a real fact. If anything is
wrong, nothing is built.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .issues import DataValidationError
from .load import DatasetInput, load_dataset
from .resolve import resolve
from .schema import ResolvedDataset, ResolvedSection
from .validate import validate

__all__ = [
    "BuildReport",
    "SectionReport",
    "build_dataset",
    "DataValidationError",
    "DatasetInput",
    "load_dataset",
    "resolve",
    "validate",
]


@dataclass(kw_only=True)
class SectionReport:
    section: str
    period: str
    status: str
    perimeter: str
    label: str
    totalRupees: int
    totalIsPublished: bool
    factCount: int
    # Facts carrying a short line of their own, rather than boilerplate.
    describedCount: int
    axes: list[str]


@dataclass(kw_only=True)
class BuildReport:
    """A summary for the command line. One shape covers every section,
    because there is only one kind of section now."""

    datasetVersion: str
    sourceCount: int
    sections: list[SectionReport]


def build_dataset(
    dataset_dir: Path, built_at: datetime | None = None
) -> tuple[ResolvedDataset, BuildReport]:
    dataset_input = load_dataset(dataset_dir)

    issues = validate(dataset_input)
    if issues:
        raise DataValidationError(issues)

    dataset, resolve_issues = resolve(dataset_input, built_at)
    if resolve_issues:
        raise DataValidationError(resolve_issues)

    return dataset, _summarise(dataset)


def _described_facts_count(section: ResolvedSection) -> int:
    """How many of a section's facts say something about themselves.

    A fact no longer carries `description` at all, generated or otherwise,
    so `summary` being set is the whole answer — unlike the TS version's
    history, this needed no boilerplate-prefix check even at the point this
    was first ported.

    Reported rather than enforced: failing the build on an undescribed line
    would make a half-filled vocabulary un-buildable, which punishes the
    contributor who filled in ten of them. Printing the ratio keeps the gap
    visible instead.
    """
    seen: set[str] = set()
    for node in section.nodes.values():
        if node.kind != "fact":
            continue
        if node.summary is not None:
            seen.add(node.localId)
    return len(seen)


def _summarise(dataset: ResolvedDataset) -> BuildReport:
    return BuildReport(
        datasetVersion=dataset.datasetVersion,
        sourceCount=len(dataset.sources),
        sections=[
            SectionReport(
                section=section.section,
                period=section.period,
                status=section.status,
                perimeter=section.perimeter,
                label=section.label,
                totalRupees=section.totalRupees,
                totalIsPublished=section.totalIsPublished,
                factCount=section.factCount,
                describedCount=_described_facts_count(section),
                axes=list(section.rootIds.keys()),
            )
            for section in dataset.sections
        ],
    )
