"""Ported from `src/build/validate.ts`.

Every semantic rule the dataset must satisfy, checked in one pass. The load
step has already guaranteed the shapes are right; what is checked here is
whether the pieces agree with each other.
"""

from __future__ import annotations

from collections.abc import Iterator

from .issues import DataIssue
from .load import DatasetInput
from .schema import (
    Amount,
    Axis,
    Citation,
    Fact,
    SectionFile,
    SignedAmount,
    Source,
    Tree,
    TreeNode,
)
from .units import UnitConversionError, to_rupees

ROOT = "@root"

TreeChild = str | TreeNode


def validate(dataset_input: DatasetInput) -> list[DataIssue]:
    issues: list[DataIssue] = []
    source_by_id = {s.id: s for s in dataset_input.sources}
    axis_by_id = {a.id: a for a in dataset_input.axes.axes}
    group_ids = {
        vocabulary.id: {g.id for g in vocabulary.groups}
        for vocabulary in dataset_input.groups.values()
    }

    _check_source_usage(dataset_input, issues)
    _check_perimeters(dataset_input, issues)
    _check_line_items(dataset_input, source_by_id, issues)
    _check_across_periods(dataset_input, axis_by_id, issues)
    _check_labels(dataset_input, issues)
    _check_award_periods(dataset_input, issues)
    _check_generator_sources(dataset_input, source_by_id, issues)

    for section in dataset_input.sections:
        _check_section(section, source_by_id, axis_by_id, group_ids, issues)

    return issues


def _direct_amounts(
    children: list[TreeChild], fact_by_id: dict[str, Fact]
) -> Iterator[Amount]:
    """The amounts one tree contributes: its leaf facts, at any nesting depth."""
    for child in children:
        if isinstance(child, str):
            fact = fact_by_id.get(child)
            if fact:
                yield fact.amount
        else:
            yield from _direct_amounts(child.children, fact_by_id)


def _check_sums(
    section: SectionFile, fact_by_id: dict[str, Fact], issues: list[DataIssue]
) -> None:
    """The one arithmetic rule, and the reason the dataset can be trusted.

    Every tree's parts must sum exactly to what they decompose. That total
    and those parts nearly always come from *different documents*, so their
    agreement is corroboration between two independent publications, not
    arithmetic performed on ourselves.
    """
    for tree in section.trees:
        if tree.derivedBy:
            continue  # generated at build time, exact by construction

        # Inline `parts` carry their amounts directly rather than through
        # facts — the same rule, just reading a different shape of leaf. A
        # part's amount is a `SignedAmount`: net capital expenditure can be
        # negative, and the sum still has to land on the total exactly.
        leaves: Iterator[Amount | SignedAmount] = (
            iter(p.amount for p in tree.parts)
            if tree.parts
            else _direct_amounts(tree.children or [], fact_by_id)
        )

        total = 0
        representable = True
        for leaf in leaves:
            try:
                total += to_rupees(leaf.value, leaf.unit)
            except UnitConversionError as error:
                representable = False
                issues.append(
                    DataIssue(
                        code="amount-not-representable",
                        section=section.section,
                        period=section.period,
                        axis=tree.axis,
                        message=str(error),
                    )
                )
        if not representable:
            continue

        published = section.root.amount if tree.of == ROOT else (
            fact_by_id[tree.of].amount if tree.of in fact_by_id else None
        )
        if not published:
            continue

        expected = to_rupees(published.value, published.unit)
        if total != expected:
            issues.append(
                DataIssue(
                    code="sum-mismatch",
                    section=section.section,
                    period=section.period,
                    axis=tree.axis,
                    factId=None if tree.of == ROOT else tree.of,
                    message=(
                        "the parts of this section do not sum to its "
                        "published total"
                        if tree.of == ROOT
                        else f'the {tree.axis} parts of "{tree.of}" do not '
                        "sum to its published amount"
                    ),
                    expected=f"{expected} rupees",
                    observed=f"{total} rupees",
                )
            )


def _check_section(
    section: SectionFile,
    source_by_id: dict[str, Source],
    axis_by_id: dict[str, Axis],
    group_ids: dict[str, set[str]],
    issues: list[DataIssue],
) -> None:
    at = {"section": section.section, "period": section.period}

    if section.perimeter == "financing" and not section.perimeterOf:
        issues.append(
            DataIssue(
                code="perimeter-undeclared",
                **at,
                message=(
                    "a financing section must name the section whose money "
                    "it describes, or nothing knows the two must not be added"
                ),
            )
        )

    # Fact ids are the dataset's public contract and its cross-period
    # identity, so a collision would silently merge two line items.
    fact_by_id: dict[str, Fact] = {}
    for fact in section.facts:
        if fact.id in fact_by_id:
            issues.append(
                DataIssue(
                    code="duplicate-id",
                    **at,
                    factId=fact.id,
                    message="two facts in this section share an id",
                )
            )
        fact_by_id[fact.id] = fact
        _check_citations(section, fact.cite, source_by_id, issues, fact_id=fact.id)

    _check_citations(section, section.root.cite, source_by_id, issues)
    for tree in section.trees:
        if tree.cite:
            _check_citations(
                section, tree.cite, source_by_id, issues, fact_id=tree.of
            )

    _check_sums(section, fact_by_id, issues)
    _check_trees(section, fact_by_id, axis_by_id, group_ids, issues)
    _check_corroboration(section, fact_by_id, source_by_id, issues)


def _walk_tree(children: list[TreeChild], visit) -> None:  # type: ignore[no-untyped-def]
    for child in children:
        if isinstance(child, str):
            visit("fact", child)
        else:
            visit("group", child.group)
            _walk_tree(child.children, visit)


class _Partition:
    __slots__ = ("tree", "leaves")

    def __init__(self, tree: Tree, leaves: list[str]) -> None:
        self.tree = tree
        self.leaves = leaves


def _check_trees(
    section: SectionFile,
    fact_by_id: dict[str, Fact],
    axis_by_id: dict[str, Axis],
    group_ids: dict[str, set[str]],
    issues: list[DataIssue],
) -> None:
    """Structure: every reference resolves, every fact is placed, nothing is
    placed twice, and two views of the same total cover the same things."""
    at = {"section": section.section, "period": section.period}
    partitions_of: dict[str, list[_Partition]] = {}
    placed: set[str] = set()
    decomposed: set[str] = set()

    for tree in section.trees:
        axis = axis_by_id.get(tree.axis)
        if not axis:
            issues.append(
                DataIssue(
                    code="unknown-axis",
                    **at,
                    axis=tree.axis,
                    message="no axis with this id is declared in vocabulary/axes.json",
                )
            )
            continue

        if tree.of != ROOT and tree.of not in fact_by_id and not tree.derivedBy:
            issues.append(
                DataIssue(
                    code="dangling-reference",
                    **at,
                    axis=tree.axis,
                    factId=tree.of,
                    message="this tree decomposes a fact that does not exist",
                )
            )

        if tree.derivedBy:
            partitions_of.setdefault(tree.of, []).append(_Partition(tree, []))
            if axis.kind == "partition":
                decomposed.add(tree.of)
            continue

        if tree.parts:
            # Inline parts describe the same money by attribute, never by
            # destination — a fact never becomes a node from this, so none
            # of the placement/orphan bookkeeping below applies to it.
            if axis.kind != "classification":
                issues.append(
                    DataIssue(
                        code="parts-on-partition-axis",
                        **at,
                        axis=tree.axis,
                        message=(
                            f'"{tree.axis}" is a partition axis; inline '
                            '"parts" may only describe a classification axis'
                        ),
                    )
                )
            vocabulary = group_ids.get(axis.groups) if axis.groups else None
            for part in tree.parts:
                if vocabulary is not None and part.group not in vocabulary:
                    issues.append(
                        DataIssue(
                            code="unknown-group",
                            **at,
                            axis=tree.axis,
                            message=f'"{part.group}" is not in the {axis.groups} vocabulary',
                        )
                    )
            continue

        leaves: list[str] = []
        seen: set[str] = set()

        # The loop variables are bound as defaults rather than captured. Today
        # `_walk_tree` consumes this callback inside the same iteration, so
        # late binding never bites — but that safety is incidental, and would
        # vanish the moment anyone made the walk lazy. `_check_across_periods`
        # already binds explicitly; this makes the two agree.
        def _visit(
            kind: str,
            node_id: str,
            _axis: Axis = axis,
            _tree: Tree = tree,
            _seen: set[str] = seen,
            _leaves: list[str] = leaves,
        ) -> None:
            if kind == "group":
                vocabulary = group_ids.get(_axis.groups) if _axis.groups else None
                if vocabulary is not None and node_id not in vocabulary:
                    issues.append(
                        DataIssue(
                            code="unknown-group",
                            **at,
                            axis=_tree.axis,
                            message=f'"{node_id}" is not in the {_axis.groups} vocabulary',
                        )
                    )
                return
            if node_id not in fact_by_id:
                issues.append(
                    DataIssue(
                        code="dangling-reference",
                        **at,
                        axis=_tree.axis,
                        factId=node_id,
                        message="tree references a fact that does not exist",
                    )
                )
                return
            # Within one tree a fact may appear only once, or the total
            # counts it twice while still looking like a plausible tree.
            if node_id in _seen:
                issues.append(
                    DataIssue(
                        code="fact-referenced-twice",
                        **at,
                        axis=_tree.axis,
                        factId=node_id,
                        message="this fact appears more than once in the same tree",
                    )
                )
            _seen.add(node_id)
            _leaves.append(node_id)
            placed.add(node_id)

        _walk_tree(tree.children or [], _visit)

        if axis.kind == "partition":
            partitions_of.setdefault(tree.of, []).append(_Partition(tree, leaves))
            decomposed.add(tree.of)

    # Two partitions of the same total are two views of one thing. Requiring
    # them to cover exactly the same facts is what makes them agree by
    # construction rather than by our checking each total separately — the
    # single most important rule in the dataset, now stated once for any
    # axis.
    for of, partitions in partitions_of.items():
        if of != ROOT and len(partitions) > 1:
            issues.append(
                DataIssue(
                    code="ambiguous-decomposition",
                    **at,
                    factId=of,
                    message=(
                        "a fact may have at most one partition; two would "
                        "leave its position in the tree undefined"
                    ),
                )
            )
            continue
        if len(partitions) < 2:
            continue
        first, *rest = partitions
        reference = set(first.leaves)
        for other in rest:
            other_set = set(other.leaves)
            missing = [i for i in reference if i not in other_set]
            extra = [i for i in other_set if i not in reference]
            for node_id in (*missing, *extra):
                issues.append(
                    DataIssue(
                        code="partitions-disagree",
                        **at,
                        axis=other.tree.axis,
                        factId=node_id,
                        message=(
                            f'"{node_id}" is not placed in both the '
                            f"{first.tree.axis} and {other.tree.axis} views"
                        ),
                    )
                )

    # A fact nothing places is invisible in every view while still sitting
    # in the file looking authoritative. Facts that are themselves
    # decomposed count as placed by their own sub-tree's parent.
    for fact in section.facts:
        if fact.id not in placed and fact.id not in decomposed:
            issues.append(
                DataIssue(
                    code="orphaned-fact",
                    **at,
                    factId=fact.id,
                    message="no tree places this fact, so nothing can ever show it",
                )
            )


def _check_corroboration(
    section: SectionFile,
    fact_by_id: dict[str, Fact],
    source_by_id: dict[str, Source],
    issues: list[DataIssue],
) -> None:
    """A Finance Commission award states what a state was *entitled* to.
    Most such grants are conditional, so what states actually drew falls
    short — publishing an award table as an actual is a real and easy
    mistake, and one this dataset made in prose before it was caught.

    So an award may back a settled figure only when the total it decomposes
    is sourced elsewhere. The sum rule then does the rest: if the award's
    parts match an independently published total to the rupee, that
    agreement is the evidence.
    """
    if section.status not in ("actual-final", "actual-provisional"):
        return

    def is_award(cite: list[Citation]) -> bool:
        if not cite:
            return False
        for citation in cite:
            source = source_by_id.get(citation.sourceId)
            if not source or source.documentKind != "award":
                return False
        return True

    def collect_fact_ids(kind: str, node_id: str, into: list[str]) -> None:
        if kind == "fact":
            into.append(node_id)

    for tree in section.trees:
        if tree.derivedBy:
            continue

        leaf_ids: list[str] = []
        _walk_tree(
            tree.children or [],
            lambda kind, node_id, _ids=leaf_ids: collect_fact_ids(kind, node_id, _ids),
        )
        parts = [fact_by_id[i] for i in leaf_ids if i in fact_by_id]
        if not parts or not all(is_award(f.cite) for f in parts):
            continue

        parent = section.root if tree.of == ROOT else fact_by_id.get(tree.of)
        parent_amount = parent.amount if parent else None
        parent_cite = parent.cite if parent else []
        if not parent or parent_amount is None or is_award(parent_cite):
            issues.append(
                DataIssue(
                    code="uncorroborated-award",
                    section=section.section,
                    period=section.period,
                    axis=tree.axis,
                    factId=None if tree.of == ROOT else tree.of,
                    message=(
                        "an award table backs settled figures without an "
                        "independently published total to agree with; an "
                        "entitlement is not a record of payment"
                    ),
                )
            )


def _check_citations(
    section: SectionFile,
    cite: list[Citation],
    source_by_id: dict[str, Source],
    issues: list[DataIssue],
    fact_id: str | None = None,
) -> None:
    for citation in cite:
        source = source_by_id.get(citation.sourceId)
        if not source:
            issues.append(
                DataIssue(
                    code="unknown-source-id",
                    section=section.section,
                    period=section.period,
                    factId=fact_id,
                    sourceId=citation.sourceId,
                    message="cited source is not in dataset/sources.json",
                )
            )
            continue
        if source.verification == "unstable":
            # If a figure could rest on a document nobody can re-verify, the
            # provenance guarantee would be decorative.
            issues.append(
                DataIssue(
                    code="unverifiable-source-cited",
                    section=section.section,
                    period=section.period,
                    factId=fact_id,
                    sourceId=citation.sourceId,
                    message=(
                        "figures may not cite a source whose bytes cannot be "
                        "re-verified; use it as a cross-reference only"
                    ),
                )
            )
        if section.status == "actual-final" and source.status != "actual-final":
            issues.append(
                DataIssue(
                    code="estimate-cited-as-actual",
                    section=section.section,
                    period=section.period,
                    factId=fact_id,
                    sourceId=citation.sourceId,
                    message=(
                        "a figure marked actual-final cites a source whose "
                        "figures are not settled actuals"
                    ),
                    expected="actual-final",
                    observed=source.status,
                )
            )


def _check_line_items(
    dataset_input: DatasetInput,
    source_by_id: dict[str, Source],
    issues: list[DataIssue],
) -> None:
    """The line-item vocabulary describes facts by id, so an entry whose id
    matches nothing is dead weight — it would silently stop appearing in the
    UI the moment a fact were renamed, and nobody would notice the prose had
    gone missing.

    Its citations go through the same checks as any other figure's: no
    unstable source, no estimate backing an actual.
    """
    line_items = dataset_input.lineItems
    if not line_items:
        return

    known: dict[str, SectionFile] = {}
    for section in dataset_input.sections:
        for fact in section.facts:
            known.setdefault(fact.id, section)

    seen: set[str] = set()
    for item in line_items.items:
        matched_section = known.get(item.id)
        if not matched_section:
            issues.append(
                DataIssue(
                    code="unknown-line-item",
                    factId=item.id,
                    message=(
                        "vocabulary/line-items.json describes a fact that "
                        "no section defines"
                    ),
                )
            )
            continue
        if item.id in seen:
            issues.append(
                DataIssue(
                    code="duplicate-id",
                    factId=item.id,
                    message="described twice in vocabulary/line-items.json",
                )
            )
        seen.add(item.id)
        _check_citations(
            matched_section, item.cite, source_by_id, issues, fact_id=item.id
        )


def _check_labels(dataset_input: DatasetInput, issues: list[DataIssue]) -> None:
    """Every fact must resolve to a label from somewhere — the section's
    `section.json`, or its own inline `label` for a section with no
    registry entry for that id. Both missing is a fact with nothing to call
    it, and `resolve` would otherwise only catch this by throwing."""
    for section in dataset_input.sections:
        definition = dataset_input.sectionDefinitions.get(section.section)
        for fact in section.facts:
            registered = definition.lines.get(fact.id) if definition else None
            has_label = bool((registered.label if registered else None) or fact.label)
            if not has_label:
                issues.append(
                    DataIssue(
                        code="missing-label",
                        section=section.section,
                        period=section.period,
                        factId=fact.id,
                        message=(
                            f'"{fact.id}" has no label — add one to '
                            f'sections/{section.section}/section.json\'s '
                            '"lines", or set it directly on the fact'
                        ),
                    )
                )


def _walk_groups(  # type: ignore[no-untyped-def]
    children: list[TreeChild], path: list[str], visit
) -> None:
    """Visit every fact id in a tree, carrying the group ids above it."""
    for child in children:
        if isinstance(child, str):
            visit(child, path)
        else:
            _walk_groups(child.children, [*path, child.group], visit)


def _check_across_periods(
    dataset_input: DatasetInput, axis_by_id: dict[str, Axis], issues: list[DataIssue]
) -> None:
    """One id, one meaning — checked across the periods of a section.

    These are the first rules here that look at more than one period at a
    time. Everything else validates a section in isolation, which is why a
    demand could carry a different name in each of five files and nothing
    complained: each file was individually correct. `CLAUDE.md` states that
    a fact's id *is* its cross-period identity, and until now nothing
    enforced it.

    The failure this catches is not hypothetical. It is the same one
    already recorded for group labels — *"they drifted the first time a
    category was renamed, silently, in five files"* — reappearing on facts,
    because the lesson was applied to the vocabularies and not to the
    sections.
    """
    by_section: dict[str, list[SectionFile]] = {}
    for section in dataset_input.sections:
        by_section.setdefault(section.section, []).append(section)

    for name, sections in by_section.items():
        if len(sections) < 2:
            continue
        periods = sorted(sections, key=lambda s: s.period)

        # --- one id, one label ---
        #
        # Only meaningful for a fact still carrying its own inline `label` —
        # once an id has a section.json registry entry there is exactly one
        # label for all periods by construction, and nothing here can drift.
        labels: dict[str, dict[str, list[str]]] = {}
        for section in periods:
            for fact in section.facts:
                if not fact.label:
                    continue
                seen = labels.setdefault(fact.id, {})
                seen.setdefault(fact.label, []).append(section.period)

        for fact_id, variants in labels.items():
            if len(variants) < 2:
                continue
            variant_text = " / ".join(
                f"{', '.join(at)}: {label!r}" for label, at in variants.items()
            )
            issues.append(
                DataIssue(
                    code="label-drift",
                    section=name,
                    factId=fact_id,
                    message=(
                        f'"{fact_id}" carries a different label in different '
                        "periods, but an id is its identity across periods "
                        f"— so one of these is wrong: {variant_text}"
                    ),
                )
            )

        # --- one id, one place in each partition ---
        paths: dict[str, dict[str, dict[str, list[str]]]] = {}
        excused: dict[str, set[str]] = {}

        for section in periods:
            for tree in section.trees:
                if tree.of != "@root":
                    continue
                axis = axis_by_id.get(tree.axis)
                if (axis.kind if axis else "partition") != "partition":
                    continue
                # A deliberate move is allowed, but the tree's `notes` must
                # name the id that moved. Exempting the whole tree would let
                # one explained change silence every unexplained one beside
                # it.
                if tree.notes:
                    note = tree.notes
                    for_axis = excused.setdefault(tree.axis, set())
                    for fact in section.facts:
                        if fact.id in note:
                            for_axis.add(fact.id)

                def _visit(
                    fact_id: str,
                    path: list[str],
                    _section: SectionFile = section,
                    _tree: Tree = tree,
                    _paths: dict[str, dict[str, dict[str, list[str]]]] = paths,
                ) -> None:
                    per_axis = _paths.setdefault(fact_id, {})
                    seen = per_axis.setdefault(_tree.axis, {})
                    key = " > ".join(path) or "(top level)"
                    seen.setdefault(key, []).append(_section.period)

                _walk_groups(tree.children or [], [], _visit)

        for fact_id, per_axis in paths.items():
            for axis_name, variants in per_axis.items():
                if len(variants) < 2:
                    continue
                if fact_id in excused.get(axis_name, set()):
                    continue
                variant_text = " / ".join(
                    f"{', '.join(at)}: {path}" for path, at in variants.items()
                )
                issues.append(
                    DataIssue(
                        code="group-drift",
                        section=name,
                        axis=axis_name,
                        factId=fact_id,
                        message=(
                            f'"{fact_id}" sits in a different group in '
                            f'different periods of the "{axis_name}" '
                            f"partition, and no tree note explains it: "
                            f"{variant_text}. If the move is deliberate, say "
                            'so in that tree\'s "notes" and name the id.'
                        ),
                    )
                )


def _check_source_usage(
    dataset_input: DatasetInput, issues: list[DataIssue]
) -> None:
    """Every source must earn its place, and the two kinds earn it in
    opposite ways. A `checksum` source is evidence: if nothing cites it, it
    is dead weight in the manifest. An `unstable` source is a
    cross-reference: it exists precisely because it cannot back a figure, so
    nothing may cite it (checked in `_check_citations`)."""
    cited: set[str] = set()

    if dataset_input.financeCommission:
        for award in dataset_input.financeCommission.awards:
            cited.add(award.sourceId)
    for section in dataset_input.sections:
        for citation in section.root.cite:
            cited.add(citation.sourceId)
        for fact in section.facts:
            for citation in fact.cite:
                cited.add(citation.sourceId)
        for tree in section.trees:
            for citation in tree.cite or []:
                cited.add(citation.sourceId)
    if dataset_input.lineItems:
        for item in dataset_input.lineItems.items:
            for citation in item.cite:
                cited.add(citation.sourceId)

    for source in dataset_input.sources:
        if source.verification == "checksum" and source.id not in cited:
            issues.append(
                DataIssue(
                    code="uncited-source",
                    sourceId=source.id,
                    message=(
                        "source is listed in the manifest but nothing cites "
                        'it; remove it, or mark it verification: "unstable" '
                        "if it is only a cross-reference"
                    ),
                )
            )


def _check_perimeters(dataset_input: DatasetInput, issues: list[DataIssue]) -> None:
    """A financing section describes money another section already counts,
    so the two must never be added. That was a paragraph in a contributing
    guide for most of this dataset's life; here it is something the build
    knows."""
    names = {s.section for s in dataset_input.sections}
    for section in dataset_input.sections:
        if section.perimeterOf and section.perimeterOf not in names:
            issues.append(
                DataIssue(
                    code="perimeter-undeclared",
                    section=section.section,
                    period=section.period,
                    message=(
                        f'perimeterOf names "{section.perimeterOf}", which '
                        "is not a section in this dataset"
                    ),
                )
            )


def _check_award_periods(dataset_input: DatasetInput, issues: list[DataIssue]) -> None:
    """A period may only use a Finance Commission award that covers it.

    The generator picks an award by `awardId` alone and never looks at the
    span it was given, so naming the wrong one produced a full, plausible,
    exactly-summing state split from the wrong percentages — and nothing
    caught it, because a derived tree has no second document to disagree
    with. That is precisely the shape of error the rest of this file exists
    to prevent, and it was reachable: this repo's own guidance claimed
    2020-21 was a Fourteenth Finance Commission year, when the Fourteenth's
    award ended with 2019-20 and 2020-21 has its own single-year Fifteenth
    Commission report.

    `fromPeriod`/`toPeriod` were already recorded on every award. This makes
    them mean something.
    """
    if not dataset_input.financeCommission:
        return
    award_by_id = {a.id: a for a in dataset_input.financeCommission.awards}

    for section in dataset_input.sections:
        for tree in section.trees:
            if not tree.derivedBy:
                continue
            award_id = tree.derivedBy.using.get("awardId")
            if not award_id:
                continue
            award = award_by_id.get(award_id)
            if not award:
                continue  # unknown awardId is the generator's error to report
            if not (award.fromPeriod <= section.period <= award.toPeriod):
                issues.append(
                    DataIssue(
                        code="award-period-mismatch",
                        section=section.section,
                        period=section.period,
                        axis=tree.axis,
                        message=(
                            f'{section.period} uses award "{award_id}", whose '
                            f"award period runs {award.fromPeriod} to "
                            f"{award.toPeriod} — its shares do not apply to "
                            "this year"
                        ),
                    )
                )


def _check_generator_sources(
    dataset_input: DatasetInput,
    source_by_id: dict[str, Source],
    issues: list[DataIssue],
) -> None:
    """A generator's source is a citation, and is held to the same rules.

    Everything a section file writes by hand goes through `_check_citations`.
    A `derivedBy` tree writes nothing — its source arrives from the award it
    names, and is attached during *resolve* — so until now it reached the
    published artifact without ever being checked. That is how four
    `actual-final` devolution years came to be backed, in the artifact, by a
    document marked `budget-estimate` from a different year: the figures were
    right, the provenance was not, and `estimate-cited-as-actual` never got a
    chance to say so.

    This is the second rule a generator has slipped past (`award-period-mismatch`
    was the first). The lesson is the general one: derived output is not
    exempt from the checks its inputs would face.
    """
    if not dataset_input.financeCommission:
        return
    award_by_id = {a.id: a for a in dataset_input.financeCommission.awards}

    for section in dataset_input.sections:
        for tree in section.trees:
            if not tree.derivedBy:
                continue
            award = award_by_id.get(tree.derivedBy.using.get("awardId", ""))
            if not award:
                continue
            _check_citations(
                section,
                [Citation(sourceId=award.sourceId, locator=award.sourceLocator)],
                source_by_id,
                issues,
            )
