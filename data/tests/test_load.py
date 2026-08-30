"""Mirrors the load-time expectations exercised implicitly by
src/build/dataset.test.ts, plus the failure paths that file doesn't reach
because it only ever loads the real, valid dataset."""

from decimal import Decimal
from pathlib import Path

import pytest

from wimtm_data.issues import DataValidationError
from wimtm_data.load import load_dataset
from wimtm_data.paths import DATASET_DIR


def test_loads_the_real_dataset() -> None:
    dataset = load_dataset(DATASET_DIR)
    assert dataset.manifest.schemaVersion == 3
    assert len(dataset.sections) >= 5
    assert "union-expenditure" in dataset.sectionDefinitions
    assert "purpose" in dataset.groups
    assert dataset.lineItems is not None
    assert dataset.financeCommission is not None
    # Decimal all the way through, not float — the point of parse_float=Decimal.
    some_amount = dataset.sections[0].facts[0].amount.value if dataset.sections[0].facts else None
    if some_amount is not None:
        assert isinstance(some_amount, Decimal)


def test_raises_with_every_problem_at_once(tmp_path: Path) -> None:
    # An empty root: missing dataset.json, missing sources manifest, no
    # sections — everything wrong at once, reported together.
    with pytest.raises(DataValidationError) as excinfo:
        load_dataset(tmp_path)
    assert len(excinfo.value.issues) >= 1
    assert all(issue.code == "schema-invalid" for issue in excinfo.value.issues)


def test_reports_a_missing_section_definition(tmp_path: Path) -> None:
    _write_minimal_dataset(tmp_path)
    # Delete the section.json that _write_minimal_dataset wrote.
    (tmp_path / "sections" / "union-expenditure" / "section.json").unlink()

    with pytest.raises(DataValidationError) as excinfo:
        load_dataset(tmp_path)
    codes = [issue.code for issue in excinfo.value.issues]
    assert "schema-invalid" in codes
    assert any("section.json is missing" in issue.message for issue in excinfo.value.issues)


def test_reports_malformed_json_without_crashing(tmp_path: Path) -> None:
    _write_minimal_dataset(tmp_path)
    (tmp_path / "dataset.json").write_text("{not valid json")

    with pytest.raises(DataValidationError) as excinfo:
        load_dataset(tmp_path)
    assert any("could not read" in issue.message for issue in excinfo.value.issues)


def _write_minimal_dataset(root: Path) -> None:
    import json

    (root / "vocabulary").mkdir(parents=True)
    (root / "sources").mkdir(parents=True)
    (root / "sections" / "union-expenditure").mkdir(parents=True)

    (root / "dataset.json").write_text(
        json.dumps(
            {
                "schemaVersion": 3,
                "datasetVersion": "2026.01.01",
                "vocabularyVersions": {},
                "revisionNotes": [],
            }
        )
    )
    (root / "vocabulary" / "axes.json").write_text(
        json.dumps(
            {
                "version": "v1",
                "axes": [
                    {
                        "id": "purpose",
                        "label": "L",
                        "description": "D",
                        "kind": "partition",
                        "groups": "purpose",
                    }
                ],
            }
        )
    )
    (root / "vocabulary" / "purpose.json").write_text(
        json.dumps(
            {
                "id": "purpose",
                "version": "v1",
                "groups": [{"id": "g", "label": "G", "description": "D"}],
            }
        )
    )
    (root / "sources" / "manifest.json").write_text(
        json.dumps(
            {
                "sources": [
                    {
                        "id": "test-source",
                        "publisher": "P",
                        "documentTitle": "T",
                        "canonicalUrl": "https://example.gov.in/x.pdf",
                        "period": "2024-25",
                        "status": "actual-final",
                        "documentKind": "budget-document",
                        "unit": "crore-rupees",
                        "retrievedAt": "2026-01-01",
                        "file": "x.pdf",
                        "checksumSha256": "a" * 64,
                    }
                ]
            }
        )
    )
    (root / "sections" / "union-expenditure" / "section.json").write_text(
        json.dumps(
            {
                "section": "union-expenditure",
                "label": "Total",
                "description": "Everything.",
                "lines": {"demand-1": {"label": "Demand One"}},
            }
        )
    )
    (root / "sections" / "union-expenditure" / "2024-25.json").write_text(
        json.dumps(
            {
                "section": "union-expenditure",
                "period": "2024-25",
                "status": "actual-final",
                "perimeter": "union-spending",
                "root": {"cite": []},
                "facts": [
                    {
                        "id": "demand-1",
                        "amount": {"value": 10, "unit": "crore-rupees"},
                        "cite": [{"sourceId": "test-source", "locator": "x"}],
                    }
                ],
                "trees": [{"of": "@root", "axis": "purpose", "children": ["demand-1"]}],
            }
        )
    )
