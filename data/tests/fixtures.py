"""Ported from src/build/fixtures.ts.

A minimal but complete dataset, used by the tests as a known-good baseline
that each test then breaks in exactly one way. Two facts of Rs 10 crore and
Rs 15 crore, totalling Rs 25 crore, arranged into two partitions of the same
root — the shape the real expenditure sections have, at the smallest size
that still exercises the rule that makes them agree.
"""

from __future__ import annotations

from wimtm_data.load import DatasetInput
from wimtm_data.schema import (
    Award,
    AxisVocabulary,
    DatasetManifest,
    Fact,
    FinanceCommission,
    GroupVocabulary,
    LineItemVocabulary,
    SectionDefinition,
    SectionFile,
    Source,
    Tree,
    TreeNode,
)


def make_fact(id: str, value_crore: float, **overrides: object) -> Fact:
    base = dict(
        id=id,
        label=f"Fact {id}",
        amount={"value": value_crore, "unit": "crore-rupees"},
        cite=[{"sourceId": "test-statement-3", "locator": f"Demand {id}"}],
    )
    base.update(overrides)
    return Fact.model_validate(base)


def group(id: str, children: list) -> TreeNode:
    return TreeNode(group=id, children=children)


def tree(of: str, axis: str, children: list) -> Tree:
    return Tree.model_validate({"of": of, "axis": axis, "children": children})


def make_section_definition(**overrides: object) -> SectionDefinition:
    base = dict(
        section="union-expenditure",
        label="Total expenditure",
        description="Everything spent.",
        lines={},
    )
    base.update(overrides)
    return SectionDefinition.model_validate(base)


def make_section(**overrides: object) -> SectionFile:
    base = dict(
        section="union-expenditure",
        period="2024-25",
        status="actual-final",
        perimeter="union-spending",
        root={
            "amount": {"value": 25, "unit": "crore-rupees"},
            "cite": [{"sourceId": "test-statement-1", "locator": "Statement 1, total"}],
        },
        facts=[make_fact("demand-1", 10), make_fact("demand-2", 15)],
        trees=[
            tree(
                "@root",
                "purpose",
                [
                    group("health-and-social-protection", ["demand-1"]),
                    group("defence-and-security", ["demand-2"]),
                ],
            ),
            tree("@root", "administrative", ["demand-1", "demand-2"]),
        ],
    )
    base.update(overrides)
    return SectionFile.model_validate(base)


# Factory functions, not module-level constants: Pydantic models are
# mutable, and several tests mutate a source in place
# (`dataset_input.sources[1].verification = "unstable"`). TS's fixtures.ts
# gets this for free — its `makeInput()` builds a fresh object literal on
# every call — so the Python port needs the same "fresh instance per call"
# shape rather than sharing one instance across tests.


def _test_source_1() -> Source:
    return Source.model_validate(
        {
            "id": "test-statement-1",
            "publisher": "Test Publisher",
            "documentTitle": "Statement 1",
            "canonicalUrl": "https://example.gov.in/stat1.pdf",
            "period": "2024-25",
            "status": "actual-final",
            "documentKind": "budget-document",
            "unit": "crore-rupees",
            "retrievedAt": "2026-01-01",
            "file": "stat1.pdf",
            "checksumSha256": "a" * 64,
            "verification": "checksum",
        }
    )


def _test_source_3() -> Source:
    return Source.model_validate(
        {
            "id": "test-statement-3",
            "publisher": "Test Publisher",
            "documentTitle": "Statement 3",
            "canonicalUrl": "https://example.gov.in/stat3.pdf",
            "period": "2024-25",
            "status": "actual-final",
            "documentKind": "budget-document",
            "unit": "crore-rupees",
            "retrievedAt": "2026-01-01",
            "file": "stat3.pdf",
            "checksumSha256": "b" * 64,
            "verification": "checksum",
        }
    )


def award_source() -> Source:
    """An award source, for the corroboration rule."""
    return Source.model_validate(
        {
            "id": "test-award",
            "publisher": "Test Commission",
            "documentTitle": "Test Finance Commission report",
            "canonicalUrl": "https://example.gov.in/award.pdf",
            "period": "2024-25",
            "status": "actual-final",
            "documentKind": "award",
            "unit": "crore-rupees",
            "retrievedAt": "2026-01-01",
            "file": "award.pdf",
            "checksumSha256": "c" * 64,
            "verification": "checksum",
        }
    )


def make_input(**overrides: object) -> DatasetInput:
    sections = overrides.pop("sections", None) or [make_section()]
    # Auto-derived so a test overriding `sections` with a new section name
    # (or a second period of the same one) does not also have to hand-write
    # a definition for it — only tests that care about a specific `lines`
    # entry need to pass sectionDefinitions explicitly.
    section_definitions = overrides.pop("sectionDefinitions", None)
    if section_definitions is None:
        names = {s.section for s in sections}
        section_definitions = {
            name: make_section_definition(section=name) for name in names
        }

    base: dict[str, object] = dict(
        manifest=DatasetManifest.model_validate(
            {
                "schemaVersion": 3,
                "datasetVersion": "2026.01.01",
                "vocabularyVersions": {"purpose": "test-1", "axes": "test-1"},
                "revisionNotes": [],
            }
        ),
        axes=AxisVocabulary.model_validate(
            {
                "version": "test-1",
                "axes": [
                    {
                        "id": "purpose",
                        "label": "What it paid for",
                        "description": "Test axis.",
                        "kind": "partition",
                        "groups": "purpose",
                    },
                    {
                        "id": "administrative",
                        "label": "Who spent it",
                        "description": "Test axis.",
                        "kind": "partition",
                    },
                    {
                        "id": "destination",
                        "label": "Where it went",
                        "description": "Test axis.",
                        "kind": "partition",
                    },
                    {
                        "id": "recipient",
                        "label": "Which state",
                        "description": "Test axis.",
                        "kind": "partition",
                    },
                    {
                        "id": "account-class",
                        "label": "Revenue or capital",
                        "description": "Test axis.",
                        "kind": "classification",
                        "groups": "account-class",
                    },
                ],
            }
        ),
        groups={
            "purpose": GroupVocabulary.model_validate(
                {
                    "id": "purpose",
                    "version": "test-1",
                    "groups": [
                        {
                            "id": "health-and-social-protection",
                            "label": "Health and social protection",
                            "description": "Test group.",
                        },
                        {
                            "id": "defence-and-security",
                            "label": "Defence and security",
                            "description": "Test group.",
                        },
                    ],
                }
            ),
            "account-class": GroupVocabulary.model_validate(
                {
                    "id": "account-class",
                    "version": "test-1",
                    "groups": [
                        {"id": "revenue", "label": "Revenue", "description": "Test group."},
                        {"id": "capital", "label": "Capital", "description": "Test group."},
                    ],
                }
            ),
        },
        sources=[_test_source_1(), _test_source_3()],
        sections=sections,
        sectionDefinitions=section_definitions,
        lineItems=None,
        financeCommission=None,
    )
    base.update(overrides)
    # DatasetInput is a plain dataclass with no field validation of its own
    # (it holds already-validated models plus plain dicts), so an override
    # passed as a raw dict — the natural way to write a test — needs
    # coercing here, the way a Pydantic field would do automatically.
    if isinstance(base.get("lineItems"), dict):
        base["lineItems"] = LineItemVocabulary.model_validate(base["lineItems"])
    if isinstance(base.get("financeCommission"), dict):
        base["financeCommission"] = FinanceCommission.model_validate(
            base["financeCommission"]
        )
    return DatasetInput(**base)  # type: ignore[arg-type]


def award(**overrides: object) -> Award:
    base = dict(
        id="test-award",
        label="Test Finance Commission",
        fromPeriod="2020-21",
        toPeriod="2025-26",
        divisiblePoolPercent=41,
        sourceId="test-award",
        sourceLocator="Test report, table 1",
        shares=[
            {"id": "karnataka", "label": "Karnataka", "sharePercent": 60},
            {"id": "kerala", "label": "Kerala", "sharePercent": 40},
        ],
    )
    base.update(overrides)
    return Award.model_validate(base)


def make_finance_commission(**overrides: object) -> FinanceCommission:
    base: dict[str, object] = dict(awards=[award()])
    base.update(overrides)
    return FinanceCommission.model_validate(base)


def _estimate_source() -> Source:
    """A source whose figures are not settled — for asserting that a rule
    which rejects estimates behind an `actual-final` figure actually fires."""
    return Source(
        id="test-estimate",
        publisher="Test",
        documentTitle="Test estimate document",
        canonicalUrl="https://example.test/estimate.pdf",
        period="2025-26",
        status="budget-estimate",
        documentKind="budget-document",
        unit="crore-rupees",
        retrievedAt="2026-01-01",
        file="estimate.pdf",
        checksumSha256="e" * 64,
    )
