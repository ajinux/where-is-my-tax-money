"""Schema-level accept/reject behaviour, mirroring the cases in
src/build/validate.test.ts that exercise Zod's own validation rather than
the semantic checks in validate.py."""

import json
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from wimtm_data.paths import DATASET_MANIFEST, SECTIONS_DIR, SOURCES_MANIFEST, VOCABULARY_DIR
from wimtm_data.schema import (
    Amount,
    AxisVocabulary,
    ClassificationPart,
    DatasetManifest,
    Fact,
    FinanceCommission,
    GroupVocabulary,
    LineItemVocabulary,
    ResolvedNode,
    SectionDefinition,
    SectionFile,
    SignedAmount,
    SourcesManifest,
    Tree,
    TreeNode,
)

CROREE = {"value": 10, "unit": "crore-rupees"}
CITE = [{"sourceId": "test-source", "locator": "test"}]


def test_period_accepts_consecutive_years() -> None:
    Fact(id="demand-1", amount=Amount(**CROREE), cite=CITE)  # no period on Fact
    SectionFile(
        section="union-expenditure",
        period="2024-25",
        status="actual-final",
        perimeter="union-spending",
        root={},
        trees=[{"of": "@root", "axis": "purpose", "children": ["demand-1"]}],
    )


def test_period_rejects_non_consecutive_years() -> None:
    with pytest.raises(ValidationError):
        SectionFile(
            section="union-expenditure",
            period="2024-26",
            status="actual-final",
            perimeter="union-spending",
            root={},
            trees=[{"of": "@root", "axis": "purpose", "children": ["demand-1"]}],
        )


def test_id_rejects_non_kebab_case() -> None:
    with pytest.raises(ValidationError):
        Fact(id="Demand_1", amount=Amount(**CROREE), cite=CITE)


def test_tree_node_recurses() -> None:
    node = TreeNode(
        group="a",
        children=["demand-1", TreeNode(group="b", children=["demand-2"])],
    )
    assert node.children[0] == "demand-1"
    assert isinstance(node.children[1], TreeNode)


@pytest.mark.parametrize(
    "kwargs",
    [
        # children + derivedBy together
        {
            "children": ["demand-1"],
            "derivedBy": {"method": "finance-commission-shares"},
        },
        # none of the three
        {},
        # children + parts together
        {
            "children": ["demand-1"],
            "parts": [{"group": "revenue", "amount": CROREE}],
            "cite": CITE,
        },
    ],
)
def test_tree_rejects_anything_but_exactly_one_shape(kwargs: dict) -> None:
    with pytest.raises(ValidationError):
        Tree(of="demand-1", axis="purpose", **kwargs)


def test_tree_accepts_exactly_one_shape() -> None:
    Tree(of="demand-1", axis="purpose", children=["demand-2"])
    Tree(
        of="demand-1",
        axis="account-class",
        parts=[{"group": "revenue", "amount": CROREE}],
        cite=CITE,
    )
    Tree(
        of="@root",
        axis="recipient",
        derivedBy={"method": "finance-commission-shares"},
    )


def test_tree_parts_require_their_own_citation() -> None:
    with pytest.raises(ValidationError):
        Tree(
            of="demand-1",
            axis="account-class",
            parts=[{"group": "revenue", "amount": CROREE}],
        )


def test_line_item_must_say_something() -> None:
    with pytest.raises(ValidationError):
        LineItemVocabulary(
            id="line-items",
            version="v1",
            items=[{"id": "demand-1", "cite": CITE}],
        )
    # summary alone, or spentOn alone, are both fine
    LineItemVocabulary(
        id="line-items",
        version="v1",
        items=[{"id": "demand-1", "summary": "x", "cite": CITE}],
    )
    LineItemVocabulary(
        id="line-items",
        version="v1",
        items=[{"id": "demand-1", "spentOn": "x", "cite": CITE}],
    )


def test_fact_label_is_optional() -> None:
    fact = Fact(id="demand-1", amount=Amount(**CROREE), cite=CITE)
    assert fact.label is None


def test_section_definition_validates_line_ids_as_keys() -> None:
    with pytest.raises(ValidationError):
        SectionDefinition(
            section="union-expenditure",
            label="x",
            description="y",
            lines={"Not_Kebab": {"label": "z"}},
        )
    definition = SectionDefinition(
        section="union-expenditure",
        label="x",
        description="y",
        lines={"demand-1": {"label": "z"}},
    )
    assert definition.lines["demand-1"].label == "z"


def test_resolved_node_parent_id_is_required_but_nullable() -> None:
    base = dict(
        id="x",
        section="s",
        period="2024-25",
        lens="purpose",
        kind="fact",
        label="L",
        depth=0,
        childIds=[],
        amountRupees=1,
        localId="x",
        sourceIds=[],
    )
    with pytest.raises(ValidationError):
        ResolvedNode(**base)  # parentId missing entirely
    node = ResolvedNode(parentId=None, **base)
    assert node.parentId is None


def test_amount_rejects_negative_and_non_finite() -> None:
    with pytest.raises(ValidationError):
        Amount(value=-1, unit="crore-rupees")
    with pytest.raises(ValidationError):
        Amount(value=float("inf"), unit="crore-rupees")
    with pytest.raises(ValidationError):
        Amount(value=float("nan"), unit="crore-rupees")


def test_only_a_classification_part_may_carry_a_negative_amount() -> None:
    """The relaxation that let net capital expenditure in has to stay narrow.

    A part of a decomposition may be signed because Statement 3 publishes a
    negative capital column; a fact's own amount may not, because money spent
    is not negative and nothing in the corpus says otherwise.
    """
    part = ClassificationPart(
        group="capital", amount=SignedAmount(value=-30.05, unit="crore-rupees")
    )
    assert part.amount.value == Decimal("-30.05")

    with pytest.raises(ValidationError):
        Fact(
            id="demand-1",
            amount=Amount(value=-30.05, unit="crore-rupees"),
            cite=CITE,
        )
    with pytest.raises(ValidationError):
        SignedAmount(value=float("nan"), unit="crore-rupees")


def _load(path: Path) -> dict:
    with path.open() as f:
        return json.load(f)


def test_every_committed_file_parses() -> None:
    """The real dataset, not fixtures — the strongest schema smoke test."""
    DatasetManifest.model_validate(_load(DATASET_MANIFEST))
    SourcesManifest.model_validate(_load(SOURCES_MANIFEST))
    AxisVocabulary.model_validate(_load(VOCABULARY_DIR / "axes.json"))
    FinanceCommission.model_validate(
        _load(VOCABULARY_DIR / "finance-commission-shares.json")
    )
    LineItemVocabulary.model_validate(_load(VOCABULARY_DIR / "line-items.json"))
    for name in ("purpose", "administrative", "account-class"):
        GroupVocabulary.model_validate(_load(VOCABULARY_DIR / f"{name}.json"))

    for path in sorted(SECTIONS_DIR.glob("*/section.json")):
        SectionDefinition.model_validate(_load(path))

    for path in sorted(SECTIONS_DIR.glob("*/*.json")):
        if path.name == "section.json":
            continue
        SectionFile.model_validate(_load(path))
