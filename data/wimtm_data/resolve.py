"""Ported from `src/build/resolve.ts`.

Turn the authored sections into the published artifact: amounts filled in
from the bottom up, every node addressable by id. There is one walk here,
used for every section of every kind — expenditure, devolution, receipts
and the cess earmark previously had four resolvers between them, all doing
the same thing to the same shape.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from .apportion import apportion
from .issues import DataIssue
from .load import DatasetInput
from .schema import (
    Amount,
    Citation,
    ClassificationPartResolved,
    ClassificationSplit,
    DerivedNote,
    Fact,
    ResolvedAxis,
    ResolvedDataset,
    ResolvedNode,
    ResolvedSection,
    SectionDefinition,
    SectionFile,
    Source,
    Tree,
    TreeNode,
)
from .units import rupees_to_number, to_rupees

ROOT = "@root"

TreeChild = str | TreeNode


class ResolvableFact(Fact):
    """A fact plus the note a generator attaches to it. Authors never write
    `derivedNote` — it exists only on facts the build produced, so the
    artifact can say plainly that an amount was computed and how."""

    derivedNote: DerivedNote | None = None


@dataclass(frozen=True)
class GroupInfo:
    label: str
    description: str
    # The body's own official website, where one was corroborated.
    url: str | None = None


@dataclass(kw_only=True)
class Context:
    section: SectionFile
    input: DatasetInput
    fact_by_id: dict[str, ResolvableFact]
    # Partition trees keyed by what they decompose, minus the root's.
    sub_trees: dict[str, Tree]
    # Children of derived trees, keyed by what they decompose.
    generated_ids: dict[str, list[str]]
    classifications: dict[str, list[Tree]]
    group_labels: dict[str, GroupInfo]
    # This section's own label/description and its facts' labels.
    section_definition: SectionDefinition
    # One short line per budget head, keyed by fact id.
    summary: dict[str, str]
    # What each budget head is spent on, keyed by fact id.
    spent_on: dict[str, str]
    nodes: dict[str, ResolvedNode] = field(default_factory=dict)


def _bake_in_verification_default(source: Source) -> Source:
    """`verification` is the one field on `Source` with a schema default
    (`"checksum"`); TS's Zod bakes a default into the parsed value
    permanently, indistinguishable from an explicit one, so it is always
    serialized. `verificationNote`/`notes` are plain optionals with no
    default and must stay absent when not provided — the same
    `exclude_unset` dump this dataset uses everywhere else already gets
    those right, so only `verification` needs forcing into
    `model_fields_set` here.
    """
    kwargs = {name: getattr(source, name) for name in source.model_fields_set}
    kwargs["verification"] = source.verification
    return Source(**kwargs)


def resolve(
    dataset_input: DatasetInput, built_at: datetime | None = None
) -> tuple[ResolvedDataset, list[DataIssue]]:
    issues: list[DataIssue] = []
    built_at = built_at or datetime.now(timezone.utc)
    # JS's Date.toISOString() always emits exactly 3 fractional digits
    # (milliseconds); Python's isoformat() emits 6 (microseconds) whenever
    # the value is non-zero. Truncate to match byte-for-byte.
    built_at_text = built_at.astimezone(timezone.utc).isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")

    dataset = ResolvedDataset(
        schemaVersion=3,
        datasetVersion=dataset_input.manifest.datasetVersion,
        builtAt=built_at_text,
        sections=[
            _resolve_section(section, dataset_input, issues)
            for section in dataset_input.sections
        ],
        axes=[
            ResolvedAxis(
                id=axis.id,
                label=axis.label,
                description=axis.description,
                kind=axis.kind,
            )
            for axis in dataset_input.axes.axes
        ],
        sources=[_bake_in_verification_default(s) for s in dataset_input.sources],
        revisionNotes=dataset_input.manifest.revisionNotes,
    )

    return dataset, issues


def _qualify(section: SectionFile, axis: str, local_id: str) -> str:
    return f"{section.section}:{section.period}:{axis}:{local_id}"


def _resolve_section(
    section: SectionFile, dataset_input: DatasetInput, issues: list[DataIssue]
) -> ResolvedSection:
    definition = dataset_input.sectionDefinitions.get(section.section)
    if not definition:
        # Unreachable once `load` has passed — it refuses to build without a
        # section.json per directory. Guarded so a caller that skips loading
        # (a test constructing DatasetInput by hand) gets a clear error
        # rather than a silently wrong label.
        raise ValueError(
            f'section "{section.section}" has no section.json defining its '
            "label and fact labels"
        )

    axis_kind = {a.id: a.kind for a in dataset_input.axes.axes}
    group_labels: dict[str, GroupInfo] = {}
    for vocabulary in dataset_input.groups.values():
        for group in vocabulary.groups:
            group_labels[group.id] = GroupInfo(
                label=group.label, description=group.description, url=group.url
            )

    items = dataset_input.lineItems.items if dataset_input.lineItems else []
    summary = {i.id: i.summary for i in items if i.summary}
    spent_on = {i.id: i.spentOn for i in items if i.spentOn}

    generated: dict[str, list[str]] = {}
    facts: list[ResolvableFact] = [
        ResolvableFact.model_validate(f, from_attributes=True)
        for f in section.facts
    ]

    # Derived trees produce their facts here, at build time, so no computed
    # amount is ever checked in where it could drift from the figures it
    # came from.
    for tree in section.trees:
        if not tree.derivedBy:
            continue
        produced = _generate(tree, section, dataset_input, issues)
        generated[tree.of] = [f.id for f in produced]
        facts.extend(produced)

    fact_by_id = {f.id: f for f in facts}

    root_trees: list[Tree] = []
    sub_trees: dict[str, Tree] = {}
    classifications: dict[str, list[Tree]] = {}

    for tree in section.trees:
        kind = axis_kind.get(tree.axis, "partition")
        if kind == "classification":
            classifications.setdefault(tree.of, []).append(tree)
        elif tree.of == ROOT:
            root_trees.append(tree)
        else:
            sub_trees[tree.of] = tree

    ctx = Context(
        section=section,
        input=dataset_input,
        fact_by_id=fact_by_id,
        sub_trees=sub_trees,
        generated_ids=generated,
        classifications=classifications,
        group_labels=group_labels,
        section_definition=definition,
        summary=summary,
        spent_on=spent_on,
    )

    root_ids: dict[str, str] = {}
    total = 0

    for tree in root_trees:
        children: list[TreeChild] = (
            [*generated.get(ROOT, [])] if tree.derivedBy else (tree.children or [])
        )

        root_id = _qualify(section, tree.axis, "root")
        rollup = _resolve_children(children, root_id, tree.axis, 1, ctx)

        # A classification of the section's own total — revenue versus
        # capital for the whole year — is keyed under @root like any other
        # tree. Only resolve_fact used to read this map, so such a tree
        # passed checkSums and then vanished from the artifact without a
        # word.
        root_sources = set(rollup.source_ids)
        root_classifications = _resolve_classifications(ROOT, root_sources, ctx)

        # Built as a plain dict first, then unpacked, so an absent optional
        # field is genuinely *unset* on the model — matching TS's conditional
        # spread (`...(x ? {key: x} : {})`) exactly. Passing `key=None`
        # explicitly is not the same thing: `parentId` is required-but-
        # nullable and must always serialize as `null`, while `cite` and
        # `classifications` here must be *absent* when empty, not `null`.
        root_kwargs: dict[str, object] = dict(
            id=root_id,
            parentId=None,
            section=section.section,
            period=section.period,
            lens=tree.axis,
            kind="group",
            label=definition.label,
            description=definition.description,
            depth=0,
            childIds=rollup.child_ids,
            childAxis=tree.axis,
            amountRupees=rupees_to_number(rollup.amount),
            localId="root",
            sourceIds=sorted(root_sources),
        )
        if section.root.cite:
            root_kwargs["cite"] = section.root.cite
        if root_classifications:
            root_kwargs["classifications"] = root_classifications
        ctx.nodes[root_id] = ResolvedNode(**root_kwargs)  # type: ignore[arg-type]

        root_ids[tree.axis] = root_id
        total = rollup.amount

    section_kwargs: dict[str, object] = dict(
        section=section.section,
        period=section.period,
        status=section.status,
        perimeter=section.perimeter,
        label=definition.label,
        description=definition.description,
        totalRupees=rupees_to_number(total),
        totalIsPublished=section.root.amount is not None,
        rootIds=root_ids,
        nodes=ctx.nodes,
        factCount=len(facts),
    )
    if section.perimeterOf:
        section_kwargs["perimeterOf"] = section.perimeterOf
    return ResolvedSection(**section_kwargs)  # type: ignore[arg-type]


@dataclass
class Rollup:
    child_ids: list[str]
    amount: int
    source_ids: set[str]


@dataclass
class NodeResult:
    id: str
    amount: int
    source_ids: set[str]


def _resolve_children(
    children: list[TreeChild], parent_id: str, lens: str, depth: int, ctx: Context
) -> Rollup:
    child_ids: list[str] = []
    source_ids: set[str] = set()
    amount = 0

    for child in children:
        result = (
            _resolve_fact(child, parent_id, lens, depth, ctx)
            if isinstance(child, str)
            else _resolve_group(child, parent_id, lens, depth, ctx)
        )
        child_ids.append(result.id)
        amount += result.amount
        source_ids |= result.source_ids

    return Rollup(child_ids=child_ids, amount=amount, source_ids=source_ids)


def _resolve_group(
    node: TreeNode, parent_id: str, lens: str, depth: int, ctx: Context
) -> NodeResult:
    node_id = _qualify(ctx.section, lens, node.group)
    rollup = _resolve_children(node.children, node_id, lens, depth + 1, ctx)
    vocabulary = ctx.group_labels.get(node.group)

    group_kwargs: dict[str, object] = dict(
        id=node_id,
        parentId=parent_id,
        section=ctx.section.section,
        period=ctx.section.period,
        lens=lens,
        kind="group",
        # A group carries no amount and no label of its own. Both used to be
        # written on the tree, and the label drifted from the vocabulary's
        # description the first time a category was renamed.
        label=vocabulary.label if vocabulary else node.group,
        description=vocabulary.description if vocabulary else node.group,
        depth=depth,
        childIds=rollup.child_ids,
        childAxis=lens,
        amountRupees=rupees_to_number(rollup.amount),
        localId=node.group,
        sourceIds=sorted(rollup.source_ids),
    )
    # Set only when there is one: the artifact serializes with
    # `exclude_unset=True`, so passing None explicitly would stamp
    # `"url": null` onto every group that has no verified website.
    if vocabulary and vocabulary.url:
        group_kwargs["url"] = vocabulary.url
    ctx.nodes[node_id] = ResolvedNode(**group_kwargs)  # type: ignore[arg-type]

    return NodeResult(id=node_id, amount=rollup.amount, source_ids=rollup.source_ids)


def _resolve_classifications(
    owner_id: str, source_ids: set[str], ctx: Context
) -> list[ClassificationSplit]:
    """Splits of one total by an attribute — revenue versus capital.

    A classification part never becomes a node: it is inlined onto the thing
    it describes, because it is not a place the money went. That makes this
    the only place its citation can live, so the part's provenance is
    carried here and its sources are merged into the owner's `sourceIds`.
    Dropping either would ship an amount that nothing in the artifact can
    account for, while `checkSourceUsage` still counted the source as
    cited — silently unfalsifiable, which is the one failure this dataset is
    built to prevent.
    """
    splits = ctx.classifications.get(owner_id, [])
    result: list[ClassificationSplit] = []

    for split in splits:
        if split.parts:
            # Inline parts carry no citation of their own — the tree they're
            # on does, exactly once, because there is only one document to
            # cite: the parts are columns of the same row as their own
            # total, not entries in a second document to corroborate
            # against.
            cite = split.cite or []
            for citation in cite:
                source_ids.add(citation.sourceId)
            parts = [
                ClassificationPartResolved(
                    localId=part.group,
                    label=(
                        ctx.group_labels[part.group].label
                        if part.group in ctx.group_labels
                        else part.group
                    ),
                    amountRupees=rupees_to_number(
                        to_rupees(part.amount.value, part.amount.unit)
                    ),
                )
                for part in split.parts
            ]
            result.append(
                ClassificationSplit(axis=split.axis, cite=cite, parts=parts)
            )
            continue

        referenced_cite: list[Citation] = []
        referenced_parts: list[ClassificationPartResolved] = []
        for child in split.children or []:
            if not isinstance(child, str):
                continue
            part = ctx.fact_by_id.get(child)
            if not part:
                continue
            for citation in part.cite:
                source_ids.add(citation.sourceId)
                referenced_cite.append(citation)
            registered = ctx.section_definition.lines.get(part.id)
            part_label = registered.label if registered else part.label
            if part_label is None:
                # Unreachable once `validate` has passed — `missing-label`
                # catches this.
                raise ValueError(
                    f'classification part "{part.id}" in '
                    f"{ctx.section.section}/{ctx.section.period} has no label"
                )
            referenced_parts.append(
                ClassificationPartResolved(
                    localId=part.id,
                    label=part_label,
                    amountRupees=rupees_to_number(
                        to_rupees(part.amount.value, part.amount.unit)
                    ),
                )
            )
        result.append(
            ClassificationSplit(
                axis=split.axis, cite=referenced_cite, parts=referenced_parts
            )
        )

    return result


def _resolve_fact(
    fact_id: str, parent_id: str, lens: str, depth: int, ctx: Context
) -> NodeResult:
    fact = ctx.fact_by_id.get(fact_id)
    if not fact:
        # Unreachable once `validate` has passed; guarded so a caller who
        # skips validation gets a clear error rather than a silently wrong
        # total.
        raise ValueError(
            f'fact "{fact_id}" referenced in '
            f"{ctx.section.section}/{ctx.section.period} does not exist"
        )

    node_id = _qualify(ctx.section, lens, fact.id)
    published = to_rupees(fact.amount.value, fact.amount.unit)
    source_ids = {c.sourceId for c in fact.cite}

    # The registry wins when both exist, so a fact mid-migration into
    # section.json cannot silently keep serving its old inline label.
    line = ctx.section_definition.lines.get(fact.id)
    label = line.label if line else fact.label
    if label is None:
        # Unreachable once `validate` has passed — `missing-label` catches
        # this.
        raise ValueError(
            f'fact "{fact.id}" in {ctx.section.section}/{ctx.section.period} '
            'has no label — add one to section.json\'s "lines" or set it on '
            "the fact"
        )

    # A fact that something decomposes keeps going: the same mechanism, one
    # level down. `validate` has already checked those parts sum to this
    # fact's own published amount, so the two agree by the time we get here.
    sub = ctx.sub_trees.get(fact.id)
    child_ids: list[str] = []
    child_axis: str | None = None
    if sub:
        sub_children: list[TreeChild] = (
            list(ctx.generated_ids.get(fact.id, [])) if sub.derivedBy else (sub.children or [])
        )
        rollup = _resolve_children(sub_children, node_id, lens, depth + 1, ctx)
        child_ids = rollup.child_ids
        child_axis = sub.axis
        source_ids |= rollup.source_ids

    classifications = _resolve_classifications(fact.id, source_ids, ctx)

    # See the root node above for why this is a conditionally-built dict
    # rather than passing `key=None` for absent optional fields.
    fact_kwargs: dict[str, object] = dict(
        id=node_id,
        parentId=parent_id,
        section=ctx.section.section,
        period=ctx.section.period,
        lens=lens,
        kind="fact",
        label=label,
        depth=depth,
        childIds=child_ids,
        amountRupees=rupees_to_number(published),
        localId=fact.id,
        sourceIds=sorted(source_ids),
        cite=fact.cite,
    )
    if child_axis:
        fact_kwargs["childAxis"] = child_axis
    if fact.basis:
        fact_kwargs["basis"] = fact.basis
    if fact.id in ctx.summary:
        fact_kwargs["summary"] = ctx.summary[fact.id]
    if fact.id in ctx.spent_on:
        fact_kwargs["spentOn"] = ctx.spent_on[fact.id]
    if fact.derivedNote is not None:
        fact_kwargs["derived"] = fact.derivedNote
    if classifications:
        fact_kwargs["classifications"] = classifications
    if line and line.url:
        fact_kwargs["url"] = line.url
    ctx.nodes[node_id] = ResolvedNode(**fact_kwargs)  # type: ignore[arg-type]

    return NodeResult(id=node_id, amount=published, source_ids=source_ids)


# --------------------------------------------------------------- generators --


def _round_thousandths(percent: Decimal) -> int:
    """Shares carry three decimal places, so thousandths of a percent are
    the natural integer weight; using them keeps the split free of floating
    point. `ROUND_HALF_UP` matches JS's `Math.round` (round half away from
    zero); in practice the multiplication already lands on an exact integer
    for every published 3-decimal share, so the rounding mode is a
    formality, not a dependency."""
    return int((percent * 1000).to_integral_value(rounding=ROUND_HALF_UP))


def _generate(
    tree: Tree, section: SectionFile, dataset_input: DatasetInput, issues: list[DataIssue]
) -> list[ResolvableFact]:
    """Facts a tree declares rather than lists.

    Both generators here exist for the same reason: a published rule plus a
    published total determines the parts exactly, so storing the parts
    would be storing something that can drift from its own inputs.
    """
    assert tree.derivedBy is not None
    method = tree.derivedBy.method
    using = tree.derivedBy.using

    if method == "finance-commission-shares":
        award = None
        if dataset_input.financeCommission:
            award = next(
                (
                    a
                    for a in dataset_input.financeCommission.awards
                    if a.id == using.get("awardId")
                ),
                None,
            )
        if not award or not section.root.amount:
            issues.append(
                DataIssue(
                    code="generator-input-missing",
                    section=section.section,
                    period=section.period,
                    message="finance-commission-shares needs a known awardId "
                    "and a published root total",
                )
            )
            return []

        total = to_rupees(section.root.amount.value, section.root.amount.unit)
        weights = [_round_thousandths(s.sharePercent) for s in award.shares]
        amounts = apportion(total, weights)
        description = (
            f"{award.label} horizontal shares applied to the published total "
            f"for {section.period}, apportioned by largest remainder so the "
            "parts sum to the total exactly."
        )

        return [
            ResolvableFact(
                id=share.id,
                label=share.label,
                amount=Amount(value=Decimal(rupees_to_number(amounts[i])), unit="rupees"),
                cite=[Citation(sourceId=award.sourceId, locator=award.sourceLocator)],
                derivedNote=DerivedNote(
                    method=method,
                    description=description,
                    sharePercent=float(share.sharePercent),
                    parameters={
                        "awardId": award.id,
                        "awardLabel": award.label,
                        "divisiblePoolPercent": str(award.divisiblePoolPercent),
                    },
                ),
            )
            for i, share in enumerate(award.shares)
        ]

    if method == "divisible-pool":
        devolution = next(
            (
                s
                for s in dataset_input.sections
                if s.section == using.get("devolutionSection")
                and s.period == section.period
            ),
            None,
        )
        award = None
        if dataset_input.financeCommission and devolution:
            award = next(
                (
                    a
                    for a in dataset_input.financeCommission.awards
                    if any(
                        t.derivedBy is not None
                        and t.derivedBy.using.get("awardId") == a.id
                        for t in devolution.trees
                    )
                ),
                None,
            )
        if not devolution or not devolution.root.amount or not award or not section.root.amount:
            issues.append(
                DataIssue(
                    code="generator-input-missing",
                    section=section.section,
                    period=section.period,
                    message="divisible-pool needs a devolution section for "
                    "the same period with a published total",
                )
            )
            return []

        gross = to_rupees(section.root.amount.value, section.root.amount.unit)
        devolved = to_rupees(
            devolution.root.amount.value, devolution.root.amount.unit
        )
        # devolution = pool x share, so pool = devolution / share. Integer
        # arithmetic scaled by 1000 keeps the percentage's three decimals
        # exact.
        share_thousandths = _round_thousandths(award.divisiblePoolPercent)
        pool = (devolved * 100_000) // share_thousandths
        non_shareable = gross - pool if gross > pool else 0
        how_computed = (
            f"Derived from the published devolution total and the "
            f"{award.label}'s {award.divisiblePoolPercent}% share: the "
            "divisible pool is not printed as its own line, but dividing "
            "devolution back out recovers it."
        )

        cite = devolution.root.cite
        parameters = {
            "awardId": award.id,
            "awardLabel": award.label,
            "divisiblePoolPercent": str(award.divisiblePoolPercent),
            "devolutionRupees": str(rupees_to_number(devolved)),
        }
        return [
            ResolvableFact(
                id="divisible-pool",
                label="Divisible pool",
                amount=Amount(value=Decimal(rupees_to_number(pool)), unit="rupees"),
                cite=cite,
                derivedNote=DerivedNote(
                    method=method,
                    # What this fact is, then how its number was produced —
                    # the fact itself carries no `description` any more, so
                    # both live here.
                    description=(
                        "The part of tax collection that states take a "
                        "share of, under the Finance Commission formula. "
                        f"{how_computed}"
                    ),
                    parameters=parameters,
                ),
            ),
            ResolvableFact(
                id="non-shareable",
                label="Cess and surcharge, outside the pool",
                amount=Amount(
                    value=Decimal(rupees_to_number(non_shareable)), unit="rupees"
                ),
                cite=cite,
                derivedNote=DerivedNote(
                    method=method,
                    description=(
                        "Tax that never enters the divisible pool, so states "
                        "receive no share of it. This is why the headline "
                        "devolution rate overstates what states actually "
                        f"get. {how_computed}"
                    ),
                    parameters=parameters,
                ),
            ),
        ]

    issues.append(
        DataIssue(
            code="unknown-generator",
            section=section.section,
            period=section.period,
            message=f'no generator named "{method}"',
        )
    )
    return []
