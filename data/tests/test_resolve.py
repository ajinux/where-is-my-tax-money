"""Resolve-specific cases ported from src/build/validate.test.ts (the ones
that call `resolve()`, not just `validate()`) plus a basic smoke test."""

from __future__ import annotations

from fixtures import make_fact, make_input, make_section, tree

from wimtm_data.resolve import resolve
from wimtm_data.schema import Tree


def test_resolves_the_default_fixture_cleanly() -> None:
    dataset, issues = resolve(make_input())
    assert issues == []
    section = dataset.sections[0]
    assert section.totalRupees == 250_000_000  # Rs 25 crore
    root = section.nodes[section.rootIds["purpose"]]
    assert root.amountRupees == 250_000_000
    demand1 = section.nodes["union-expenditure:2024-25:purpose:demand-1"]
    assert demand1.label == "Fact demand-1"
    assert demand1.amountRupees == 100_000_000  # Rs 10 crore


def test_takes_group_labels_from_the_vocabulary_never_from_the_tree() -> None:
    # Labels used to be written on each year's tree while descriptions came
    # from the taxonomy, and the two drifted the first time a category was
    # renamed. There is now only one place to write them.
    dataset, _ = resolve(make_input())
    node = dataset.sections[0].nodes[
        "union-expenditure:2024-25:purpose:defence-and-security"
    ]
    assert node.label == "Defence and security"


def test_resolves_both_partitions_to_the_same_total() -> None:
    dataset, _ = resolve(make_input())
    section = dataset.sections[0]
    purpose = section.nodes[section.rootIds["purpose"]]
    administrative = section.nodes[section.rootIds["administrative"]]
    assert purpose.amountRupees == administrative.amountRupees


def test_continues_a_decomposition_below_a_fact_in_every_partition() -> None:
    section = make_section()
    section.facts += [make_fact("part-a", 6), make_fact("part-b", 4)]
    section.trees.append(tree("demand-1", "destination", ["part-a", "part-b"]))
    dataset, _ = resolve(make_input(sections=[section]))
    nodes = dataset.sections[0].nodes

    for lens in ("purpose", "administrative"):
        parent = nodes[f"union-expenditure:2024-25:{lens}:demand-1"]
        assert len(parent.childIds) == 2
        assert parent.childAxis == "destination"
        summed = sum(nodes[i].amountRupees for i in parent.childIds)
        assert summed == parent.amountRupees


def test_accepts_a_revenue_capital_split_without_treating_it_as_a_destination() -> None:
    section = make_section()
    section.facts.append(make_fact("demand-1-revenue", 6.5))
    section.facts.append(make_fact("demand-1-capital", 3.5))
    section.trees.append(
        tree("demand-1", "account-class", ["demand-1-revenue", "demand-1-capital"])
    )

    dataset, issues = resolve(make_input(sections=[section]))
    assert issues == []
    node = dataset.sections[0].nodes["union-expenditure:2024-25:purpose:demand-1"]

    # It must not become a child, or a reader would see it as somewhere the
    # money went rather than as a description of the same money.
    assert node.childIds == []
    assert len(node.classifications[0].parts) == 2


def test_carries_a_classification_parts_provenance_into_the_artifact() -> None:
    section = make_section()
    section.facts.append(
        make_fact(
            "demand-1-revenue",
            6.5,
            cite=[{"sourceId": "test-statement-1", "locator": "Demand 1, Revenue"}],
        )
    )
    section.facts.append(
        make_fact(
            "demand-1-capital",
            3.5,
            cite=[{"sourceId": "test-statement-1", "locator": "Demand 1, Capital"}],
        )
    )
    section.trees.append(
        tree("demand-1", "account-class", ["demand-1-revenue", "demand-1-capital"])
    )

    dataset, issues = resolve(make_input(sections=[section]))
    assert issues == []
    node = dataset.sections[0].nodes["union-expenditure:2024-25:purpose:demand-1"]

    # A classification part never becomes a node, so if its citation is not
    # carried here it exists nowhere in the artifact.
    assert [c.model_dump() for c in node.classifications[0].cite] == [
        {"sourceId": "test-statement-1", "locator": "Demand 1, Revenue"},
        {"sourceId": "test-statement-1", "locator": "Demand 1, Capital"},
    ]
    assert "test-statement-1" in node.sourceIds


def test_resolves_a_classification_of_the_sections_own_total() -> None:
    section = make_section()
    section.facts.append(make_fact("all-revenue", 20))
    section.facts.append(make_fact("all-capital", 5))
    section.trees.append(tree("@root", "account-class", ["all-revenue", "all-capital"]))

    dataset, issues = resolve(make_input(sections=[section]))
    assert issues == []
    root = dataset.sections[0].nodes["union-expenditure:2024-25:purpose:root"]

    # Keyed under @root, it used to pass the sum check and then vanish,
    # because only resolve_fact read the classification map.
    assert [p.localId for p in root.classifications[0].parts] == [
        "all-revenue",
        "all-capital",
    ]
    assert len(root.childIds) == 2  # still the two purpose groups


def test_accepts_and_resolves_inline_parts_with_labels_from_the_group_vocabulary() -> None:
    section = make_section()
    parts_cite = [
        {"sourceId": "test-statement-3", "locator": "Demand No. 1, Revenue and Capital columns"}
    ]
    # tree() only builds the children-style shape; the parts style needs its
    # own constructor call.
    section.trees.append(
        Tree.model_validate(
            {
                "of": "demand-1",
                "axis": "account-class",
                "parts": [
                    {"group": "revenue", "amount": {"value": 6, "unit": "crore-rupees"}},
                    {"group": "capital", "amount": {"value": 4, "unit": "crore-rupees"}},
                ],
                "cite": parts_cite,
            }
        )
    )

    dataset, issues = resolve(make_input(sections=[section]))
    assert issues == []
    node = dataset.sections[0].nodes["union-expenditure:2024-25:purpose:demand-1"]

    assert node.childIds == []
    split = node.classifications[0]
    assert [c.model_dump() for c in split.cite] == parts_cite
    assert [(p.localId, p.label, p.amountRupees) for p in split.parts] == [
        ("revenue", "Revenue", 60_000_000),
        ("capital", "Capital", 40_000_000),
    ]
    assert "test-statement-3" in node.sourceIds
