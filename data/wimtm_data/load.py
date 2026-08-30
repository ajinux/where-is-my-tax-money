"""Ported from `src/build/load.ts`.

Read every file that makes up the dataset and check it against its schema.

Sections are **discovered** rather than listed. The manifest used to carry
one array of periods per section kind, which meant four hand-maintained
lists that had to agree with the filesystem and with each other; adding a
section meant remembering all of them. A directory is the list.

Schema failures are fatal — the semantic checks in `validate` assume
well-formed input — but all of them across all files are reported together
so one run shows every problem.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from .issues import DataIssue, DataValidationError
from .schema import (
    AxisVocabulary,
    DatasetManifest,
    FinanceCommission,
    GroupVocabulary,
    LineItemVocabulary,
    SectionDefinition,
    SectionFile,
    Source,
    SourcesManifest,
)

T = TypeVar("T", bound=BaseModel)


@dataclass(kw_only=True)
class DatasetInput:
    manifest: DatasetManifest
    axes: AxisVocabulary
    groups: dict[str, GroupVocabulary]
    lineItems: LineItemVocabulary | None
    sources: list[Source]
    sections: list[SectionFile]
    # A section's own label/description and its facts' labels, keyed by
    # section id.
    sectionDefinitions: dict[str, SectionDefinition]
    financeCommission: FinanceCommission | None


def _parse_file(
    path: Path, model_cls: type[T], issues: list[DataIssue]
) -> T | None:
    try:
        # Decimal, not float: figures reach the schema as the exact digits
        # printed in the JSON text, with no float64 round-trip in between.
        raw = json.loads(path.read_text(encoding="utf-8"), parse_float=Decimal)
    except OSError as error:
        issues.append(
            DataIssue(code="schema-invalid", message=f"could not read {path}: {error}")
        )
        return None
    except json.JSONDecodeError as error:
        issues.append(
            DataIssue(code="schema-invalid", message=f"could not read {path}: {error}")
        )
        return None

    try:
        return model_cls.model_validate(raw)
    except ValidationError as error:
        for problem in error.errors():
            where = ".".join(str(p) for p in problem["loc"]) or "(root)"
            issues.append(
                DataIssue(
                    code="schema-invalid",
                    message=f"{path} → {where}: {problem['msg']}",
                )
            )
        return None


def _json_files(directory: Path) -> list[str]:
    if not directory.exists():
        return []
    return sorted(p.name for p in directory.iterdir() if p.suffix == ".json")


def load_dataset(dataset_dir: Path) -> DatasetInput:
    issues: list[DataIssue] = []

    manifest = _parse_file(dataset_dir / "dataset.json", DatasetManifest, issues)

    vocabulary_dir = dataset_dir / "vocabulary"
    axes = _parse_file(vocabulary_dir / "axes.json", AxisVocabulary, issues)

    groups: dict[str, GroupVocabulary] = {}
    excluded = {"axes.json", "finance-commission-shares.json", "line-items.json"}
    for name in _json_files(vocabulary_dir):
        if name in excluded:
            continue
        vocabulary = _parse_file(
            vocabulary_dir / name, GroupVocabulary, issues
        )
        if vocabulary:
            groups[vocabulary.id] = vocabulary

    sources_manifest = _parse_file(
        dataset_dir / "sources.json", SourcesManifest, issues
    )

    # Every section, of every kind, read by the same code into the same
    # shape. `section.json` sits beside the period files in the same
    # directory but is a different shape entirely, so it is read on its own
    # and skipped by the period-file loop below.
    sections: list[SectionFile] = []
    section_definitions: dict[str, SectionDefinition] = {}
    sections_dir = dataset_dir / "sections"
    if sections_dir.exists():
        for section_dir in sorted(p for p in sections_dir.iterdir() if p.is_dir()):
            section_name = section_dir.name
            definition_path = section_dir / "section.json"
            if definition_path.exists():
                definition = _parse_file(
                    definition_path, SectionDefinition, issues
                )
                if definition:
                    section_definitions[definition.section] = definition
            else:
                issues.append(
                    DataIssue(
                        code="schema-invalid",
                        section=section_name,
                        message=(
                            f"sections/{section_name}/section.json is missing "
                            "— every section directory needs one"
                        ),
                    )
                )

            for name in _json_files(section_dir):
                if name == "section.json":
                    continue
                section = _parse_file(section_dir / name, SectionFile, issues)
                if section:
                    sections.append(section)

    # What each budget head is actually spent on. Optional: the dataset is
    # perfectly valid with none of it, it is just less legible.
    line_items_path = vocabulary_dir / "line-items.json"
    line_items = (
        _parse_file(line_items_path, LineItemVocabulary, issues)
        if line_items_path.exists()
        else None
    )

    shares_path = vocabulary_dir / "finance-commission-shares.json"
    finance_commission = (
        _parse_file(shares_path, FinanceCommission, issues)
        if shares_path.exists()
        else None
    )

    if issues:
        raise DataValidationError(issues)
    if not manifest or not axes or not sources_manifest or not sections:
        raise DataValidationError(
            [
                DataIssue(
                    code="schema-invalid",
                    message="dataset is missing a required file, or has no sections",
                )
            ]
        )

    return DatasetInput(
        manifest=manifest,
        axes=axes,
        groups=groups,
        lineItems=line_items,
        sources=sources_manifest.sources,
        sections=sections,
        sectionDefinitions=section_definitions,
        financeCommission=finance_commission,
    )
