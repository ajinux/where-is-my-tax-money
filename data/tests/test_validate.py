"""Ported from src/build/validate.test.ts — the semantic-check cases. The
classification/inline-parts cases that call `resolve()` live in
test_resolve.py instead, alongside their own assertions on the artifact."""

from __future__ import annotations

from fixtures import (
    _estimate_source,
    award,
    award_source,
    group,
    make_fact,
    make_input,
    make_section,
    tree,
)

from wimtm_data.issues import IssueCode
from wimtm_data.schema import Tree
from wimtm_data.validate import validate


def expect_issue(dataset_input, code: IssueCode) -> None:  # type: ignore[no-untyped-def]
    codes = [issue.code for issue in validate(dataset_input)]
    assert code in codes, f"expected {code!r} among {codes!r}"


def test_accepts_a_well_formed_dataset() -> None:
    assert validate(make_input()) == []


# --- the one arithmetic rule ------------------------------------------


def test_rejects_parts_that_do_not_sum_to_a_published_section_total() -> None:
    section = make_section()
    section.root.amount = {"value": 30, "unit": "crore-rupees"}
    expect_issue(make_input(sections=[section]), "sum-mismatch")


def test_rejects_parts_that_do_not_sum_to_the_fact_they_decompose() -> None:
    section = make_section()
    section.facts += [make_fact("part-a", 6), make_fact("part-b", 3)]
    section.trees.append(tree("demand-1", "destination", ["part-a", "part-b"]))
    expect_issue(make_input(sections=[section]), "sum-mismatch")


def test_accepts_parts_that_sum_to_the_fact_they_decompose() -> None:
    section = make_section()
    section.facts += [make_fact("part-a", 6), make_fact("part-b", 4)]
    section.trees.append(tree("demand-1", "destination", ["part-a", "part-b"]))
    assert validate(make_input(sections=[section])) == []


def test_applies_the_same_rule_three_levels_down() -> None:
    section = make_section()
    section.facts += [
        make_fact("part-a", 6),
        make_fact("part-b", 4),
        make_fact("part-a-karnataka", 5),
    ]
    section.trees += [
        tree("demand-1", "destination", ["part-a", "part-b"]),
        # 5 != 6, and nothing about this depth needed new code to catch it.
        tree("part-a", "recipient", ["part-a-karnataka"]),
    ]
    expect_issue(make_input(sections=[section]), "sum-mismatch")


def test_rejects_an_amount_finer_than_one_rupee() -> None:
    section = make_section(
        facts=[make_fact("demand-1", 10.000000001), make_fact("demand-2", 15)]
    )
    expect_issue(make_input(sections=[section]), "amount-not-representable")


# --- structure -----------------------------------------------------------


def test_rejects_a_fact_placed_twice_in_one_tree() -> None:
    section = make_section()
    section.trees[1] = tree(
        "@root", "administrative", ["demand-1", "demand-1", "demand-2"]
    )
    expect_issue(make_input(sections=[section]), "fact-referenced-twice")


def test_rejects_two_partitions_of_the_same_total_covering_different_facts() -> None:
    section = make_section()
    section.trees[1] = tree("@root", "administrative", ["demand-1"])
    expect_issue(make_input(sections=[section]), "partitions-disagree")


def test_rejects_a_tree_pointing_at_a_fact_that_does_not_exist() -> None:
    section = make_section()
    section.trees[1] = tree(
        "@root", "administrative", ["demand-1", "demand-2", "demand-404"]
    )
    expect_issue(make_input(sections=[section]), "dangling-reference")


def test_rejects_a_fact_no_tree_places() -> None:
    section = make_section()
    section.facts.append(make_fact("demand-3", 5))
    expect_issue(make_input(sections=[section]), "orphaned-fact")


def test_rejects_two_facts_sharing_an_id() -> None:
    section = make_section()
    section.facts.append(make_fact("demand-1", 4))
    expect_issue(make_input(sections=[section]), "duplicate-id")


def test_rejects_a_fact_with_two_partitions() -> None:
    section = make_section()
    section.facts += [make_fact("part-a", 10), make_fact("part-b", 10)]
    section.trees += [
        tree("demand-1", "destination", ["part-a"]),
        tree("demand-1", "recipient", ["part-b"]),
    ]
    expect_issue(make_input(sections=[section]), "ambiguous-decomposition")


def test_rejects_an_axis_that_is_not_declared() -> None:
    section = make_section()
    section.trees.append(tree("demand-1", "invented-axis", ["demand-2"]))
    expect_issue(make_input(sections=[section]), "unknown-axis")


def test_rejects_a_group_outside_its_axis_vocabulary() -> None:
    section = make_section()
    section.trees[0] = tree(
        "@root",
        "purpose",
        [
            group("health-and-social-protection", ["demand-1"]),
            group("invented-category", ["demand-2"]),
        ],
    )
    expect_issue(make_input(sections=[section]), "unknown-group")


# --- inline classification parts ------------------------------------------


def test_rejects_inline_parts_on_a_partition_axis() -> None:
    section = make_section()
    section.trees.append(
        Tree.model_validate(
            {
                "of": "demand-1",
                "axis": "purpose",
                "parts": [
                    {"group": "revenue", "amount": {"value": 6, "unit": "crore-rupees"}},
                    {"group": "capital", "amount": {"value": 4, "unit": "crore-rupees"}},
                ],
                "cite": [{"sourceId": "test-statement-3", "locator": "test"}],
            }
        )
    )
    expect_issue(make_input(sections=[section]), "parts-on-partition-axis")


def test_rejects_inline_parts_that_do_not_sum_to_the_fact_they_decompose() -> None:
    section = make_section()
    section.trees.append(
        Tree.model_validate(
            {
                "of": "demand-1",
                "axis": "account-class",
                "parts": [
                    {"group": "revenue", "amount": {"value": 6, "unit": "crore-rupees"}},
                    # demand-1 is 10, not 9
                    {"group": "capital", "amount": {"value": 3, "unit": "crore-rupees"}},
                ],
                "cite": [{"sourceId": "test-statement-3", "locator": "test"}],
            }
        )
    )
    expect_issue(make_input(sections=[section]), "sum-mismatch")


# --- one id, one meaning, across periods -----------------------------------
#
# Everything above validates a section on its own, which is exactly how five
# year files came to carry five different names for the same demand without
# a word of complaint: each file was individually correct.


def test_rejects_the_same_id_carrying_different_labels_in_different_periods() -> None:
    earlier = make_section(period="2023-24")
    later = make_section()
    later.facts[0] = make_fact("demand-1", 10, label="Renamed halfway")
    expect_issue(make_input(sections=[earlier, later]), "label-drift")


def test_accepts_an_id_whose_label_is_identical_in_every_period() -> None:
    earlier = make_section(period="2023-24")
    later = make_section()
    assert validate(make_input(sections=[earlier, later])) == []


def test_rejects_a_fact_moving_between_groups_without_an_explanation() -> None:
    earlier = make_section(period="2023-24")
    later = make_section()
    # Both facts under one group rather than an empty group plus a full one —
    # TreeNode requires at least one child, unlike TS's fixtures.ts, which
    # never runs these objects through Zod at all. Same test intent: demand-1
    # moves from health-and-social-protection (in `earlier`) to
    # defence-and-security (in `later`).
    later.trees[0] = tree(
        "@root",
        "purpose",
        [group("defence-and-security", ["demand-1", "demand-2"])],
    )
    expect_issue(make_input(sections=[earlier, later]), "group-drift")


def test_accepts_a_move_when_the_tree_note_names_the_id_that_moved() -> None:
    earlier = make_section(period="2023-24")
    later = make_section()
    moved = tree(
        "@root",
        "purpose",
        [group("defence-and-security", ["demand-1", "demand-2"])],
    )
    later.trees[0] = moved.model_copy(
        update={"notes": "demand-1 was reclassified after the ministry was merged."}
    )
    assert validate(make_input(sections=[earlier, later])) == []


def test_one_explained_move_does_not_excuse_an_unexplained_one_beside_it() -> None:
    earlier = make_section(period="2023-24")
    later = make_section()
    moved = tree(
        "@root",
        "purpose",
        [
            group("health-and-social-protection", ["demand-2"]),
            group("defence-and-security", ["demand-1"]),
        ],
    )
    # Names demand-1 only, so demand-2's move is still unaccounted for.
    later.trees[0] = moved.model_copy(
        update={"notes": "demand-1 was reclassified after the ministry was merged."}
    )
    drifts = [
        i for i in validate(make_input(sections=[earlier, later])) if i.code == "group-drift"
    ]
    assert [i.factId for i in drifts] == ["demand-2"]


# --- provenance -------------------------------------------------------------


def test_rejects_an_actuals_figure_that_cites_a_budget_estimate() -> None:
    dataset_input = make_input()
    dataset_input.sources[1].status = "budget-estimate"
    expect_issue(dataset_input, "estimate-cited-as-actual")


def test_rejects_a_citation_of_a_source_that_cannot_be_reverified() -> None:
    dataset_input = make_input()
    dataset_input.sources[1].verification = "unstable"
    expect_issue(dataset_input, "unverifiable-source-cited")


def test_rejects_a_checksummed_source_that_nothing_cites() -> None:
    dataset_input = make_input()
    orphan = dataset_input.sources[0].model_copy(
        update={"id": "orphan-statement", "file": "orphan.pdf"}
    )
    dataset_input.sources.append(orphan)
    expect_issue(dataset_input, "uncited-source")


def test_allows_an_unstable_source_to_sit_uncited_as_a_cross_reference() -> None:
    dataset_input = make_input()
    cross_ref = dataset_input.sources[0].model_copy(
        update={
            "id": "cross-reference",
            "file": "cross-reference.html",
            "verification": "unstable",
        }
    )
    dataset_input.sources.append(cross_ref)
    assert validate(dataset_input) == []


def test_rejects_an_award_used_as_an_actual_with_nothing_to_corroborate_it() -> None:
    section = make_section()
    part = make_fact(
        "part-a", 10, cite=[{"sourceId": "test-award", "locator": "Table 10.4"}]
    )
    section.facts.append(part)
    # demand-1 itself now cites the award too, so nothing independent agrees.
    section.facts[0] = make_fact(
        "demand-1", 10, cite=[{"sourceId": "test-award", "locator": "Table 10.4"}]
    )
    section.trees.append(tree("demand-1", "destination", ["part-a"]))
    dataset_input = make_input(sections=[section])
    dataset_input.sources.append(award_source())
    expect_issue(dataset_input, "uncorroborated-award")


def test_accepts_an_award_split_whose_total_is_published_elsewhere() -> None:
    section = make_section()
    section.facts.append(
        make_fact("part-a", 10, cite=[{"sourceId": "test-award", "locator": "Table 10.4"}])
    )
    section.trees.append(tree("demand-1", "destination", ["part-a"]))
    dataset_input = make_input(sections=[section])
    dataset_input.sources.append(award_source())
    assert validate(dataset_input) == []


# --- what a line is spent on ------------------------------------------------


def test_accepts_a_line_item_description_of_a_fact_that_exists() -> None:
    from wimtm_data.resolve import resolve

    dataset_input = make_input(
        lineItems={
            "id": "line-items",
            "version": "test-1",
            "items": [
                {
                    "id": "demand-1",
                    "spentOn": "Aircraft, warships and vehicles. Not salaries.",
                    "cite": [{"sourceId": "test-statement-3", "locator": "Demand 1"}],
                }
            ],
        }
    )
    assert validate(dataset_input) == []

    dataset, _ = resolve(dataset_input)
    node = dataset.sections[0].nodes["union-expenditure:2024-25:purpose:demand-1"]
    assert "Aircraft" in node.spentOn


def test_resolves_a_summary_onto_the_fact_it_describes() -> None:
    from wimtm_data.resolve import resolve

    dataset_input = make_input(
        lineItems={
            "id": "line-items",
            "version": "test-1",
            "items": [
                {
                    "id": "demand-1",
                    "summary": "Buys aircraft and warships.",
                    "cite": [{"sourceId": "test-statement-3", "locator": "Demand 1"}],
                }
            ],
        }
    )
    assert validate(dataset_input) == []

    dataset, _ = resolve(dataset_input)
    node = dataset.sections[0].nodes["union-expenditure:2024-25:purpose:demand-1"]
    assert node.summary == "Buys aircraft and warships."


def test_rejects_a_line_item_description_of_a_fact_that_does_not_exist() -> None:
    dataset_input = make_input(
        lineItems={
            "id": "line-items",
            "version": "test-1",
            "items": [
                {
                    "id": "demand-404",
                    "spentOn": "Describes nothing.",
                    "cite": [{"sourceId": "test-statement-3", "locator": "nowhere"}],
                }
            ],
        }
    )
    expect_issue(dataset_input, "unknown-line-item")


def test_holds_a_line_item_citation_to_the_same_standard_as_any_figure() -> None:
    dataset_input = make_input(
        lineItems={
            "id": "line-items",
            "version": "test-1",
            "items": [
                {
                    "id": "demand-1",
                    "spentOn": "Sourced from a document nobody can re-verify.",
                    "cite": [{"sourceId": "test-statement-3", "locator": "Demand 1"}],
                }
            ],
        }
    )
    dataset_input.sources[1].verification = "unstable"
    expect_issue(dataset_input, "unverifiable-source-cited")


# --- perimeter ---------------------------------------------------------


def test_rejects_a_financing_section_that_does_not_say_what_it_finances() -> None:
    financing = make_section(section="cess-earmark", perimeter="financing")
    expect_issue(
        make_input(sections=[make_section(), financing]), "perimeter-undeclared"
    )


def test_rejects_a_perimeter_of_naming_a_section_that_does_not_exist() -> None:
    financing = make_section(
        section="cess-earmark", perimeter="financing", perimeterOf="no-such-section"
    )
    expect_issue(
        make_input(sections=[make_section(), financing]), "perimeter-undeclared"
    )


def test_a_period_outside_its_award_period_is_reported() -> None:
    """Nothing else could catch this.

    A derived state split is generated from percentages, so it always sums to
    the total exactly — there is no second document for it to disagree with.
    Name an award that does not cover the year and you get a complete,
    plausible, wrong answer.
    """
    dataset_input = make_input(
        sections=[
            make_section(
                section="tax-devolution",
                period="2020-21",
                perimeter="outside-union-spending",
                facts=[],
                trees=[
                    {
                        "of": "@root",
                        "axis": "recipient",
                        "derivedBy": {
                            "method": "finance-commission-shares",
                            "using": {"awardId": "test-award"},
                        },
                    }
                ],
            )
        ],
        financeCommission={
            "id": "finance-commission-shares",
            "version": "v1",
            # covers 2021-22 onward — not the section's 2020-21
            "awards": [award(fromPeriod="2021-22", toPeriod="2025-26")],
        },
    )
    codes = [i.code for i in validate(dataset_input)]
    assert "award-period-mismatch" in codes


def test_a_period_inside_its_award_period_is_accepted() -> None:
    dataset_input = make_input(
        sections=[
            make_section(
                section="tax-devolution",
                period="2024-25",
                perimeter="outside-union-spending",
                facts=[],
                trees=[
                    {
                        "of": "@root",
                        "axis": "recipient",
                        "derivedBy": {
                            "method": "finance-commission-shares",
                            "using": {"awardId": "test-award"},
                        },
                    }
                ],
            )
        ],
        financeCommission={
            "id": "finance-commission-shares",
            "version": "v1",
            "awards": [award(fromPeriod="2021-22", toPeriod="2025-26")],
        },
    )
    codes = [i.code for i in validate(dataset_input)]
    assert "award-period-mismatch" not in codes


def test_a_generators_own_source_is_held_to_the_citation_rules() -> None:
    """The gap that let bad provenance reach the artifact.

    A section file writes no citation for a `derivedBy` tree — the source
    comes from the award it names and is attached at resolve time — so it
    used to reach the published dataset unchecked. Four `actual-final`
    devolution years were consequently backed, in the artifact, by a document
    marked `budget-estimate` from a year none of them were.
    """
    dataset_input = make_input(
        sections=[
            make_section(
                section="tax-devolution",
                period="2024-25",
                status="actual-final",
                perimeter="outside-union-spending",
                facts=[],
                trees=[
                    {
                        "of": "@root",
                        "axis": "recipient",
                        "derivedBy": {
                            "method": "finance-commission-shares",
                            "using": {"awardId": "test-award"},
                        },
                    }
                ],
            )
        ],
        sources=[_estimate_source()],
        financeCommission={
            "id": "finance-commission-shares",
            "version": "v1",
            "awards": [award(sourceId="test-estimate")],
        },
    )
    expect_issue(dataset_input, "estimate-cited-as-actual")
