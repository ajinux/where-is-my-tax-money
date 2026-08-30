"""The whole authored + resolved contract, in three ideas.

1. A **fact** is a published figure: an amount, a citation, and (usually) a
   label. 2. A **tree** decomposes something into facts along a named axis,
   and its parts must sum to what it decomposes. 3. A **section** is a
   period's worth of facts and trees, with its perimeter and status declared.

That is the entire model, and it is the same at every depth. A year's total
decomposed into purpose categories, a demand decomposed into the components
its Notes on Demands publish, a component decomposed into the states that
received it, a cess decomposed into reserve funds and then into schemes —
all of it is the same structure and obeys the same one rule.

Ported from `src/schema/{primitives,input,output}.ts`. Pydantic is the
Python equivalent of Zod here: one model is both the runtime validator and
the static type, so there is no separate `z.infer`-style step to keep in
sync. Field names stay camelCase throughout, matching the JSON on disk
exactly — this is a contract with existing files, not fresh Python API
design.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, ConfigDict, Field, model_validator
from pydantic import BaseModel as _PydanticBaseModel

# --------------------------------------------------------------- primitives --


class BaseModel(_PydanticBaseModel):
    # TS's object literals are structurally typed, so test code (and callers
    # generally) routinely does `section.root.amount = {value, unit}` and
    # expects it validated the same as construction. Pydantic does not
    # validate on assignment by default; this makes every model here behave
    # the way the ported TS test suite assumes.
    model_config = ConfigDict(validate_assignment=True)


NonEmptyStr = Annotated[str, Field(min_length=1)]


def _check_period(value: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}", value):
        raise ValueError('period must look like "2024-25"')
    start, end = int(value[:4]), int(value[5:7])
    if (start + 1) % 100 != end:
        raise ValueError("a period must span two consecutive calendar years")
    return value


# Almost always a fiscal year in India's April-March convention, written as
# the pair of calendar years it spans. Display prefixes such as "FY" belong
# to the presentation layer.
Period = Annotated[str, AfterValidator(_check_period)]


def _check_id(value: str) -> str:
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
        raise ValueError("id must be lowercase kebab-case")
    return value


# Ids are scoped to their section and period, so they carry no year prefix.
# `demand-42` in the 2024-25 file and `demand-42` in the 2023-24 file are the
# same line item followed across years.
Id = Annotated[str, AfterValidator(_check_id)]


def _check_iso_date(value: str) -> str:
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("must be an ISO date (YYYY-MM-DD)") from exc
    return value


IsoDate = Annotated[str, AfterValidator(_check_iso_date)]


def _check_iso_datetime(value: str) -> str:
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("must be an ISO datetime") from exc
    return value


IsoDateTime = Annotated[str, AfterValidator(_check_iso_datetime)]

Unit = Literal["rupees", "lakh-rupees", "crore-rupees"]

# Only `actual-final` figures are settled; everything else is an estimate and
# must be labelled as such wherever it is shown.
Status = Literal[
    "actual-final", "actual-provisional", "revised-estimate", "budget-estimate"
]

# `accounts`/`budget-document` report what happened or what is planned. An
# `award` is different in kind: a Finance Commission recommendation is an
# entitlement, not a record of payment, so it may back a settled figure only
# when corroborated (see `checkCorroboration` in validate.py).
DocumentKind = Literal["accounts", "budget-document", "award"]

# How a section's money relates to union expenditure, which is the only thing
# that says whether two sections may be added together. `outside-union-spending`
# (devolution) and `financing` (the cess earmark, which requires `perimeterOf`)
# may never be summed with `union-spending`.
Perimeter = Literal[
    "union-spending", "outside-union-spending", "financing", "receipts"
]

# `partition` splits a total by where the money went — two partitions of the
# same total must cover exactly the same items. `classification` splits the
# same money by an attribute (revenue versus capital); its parts are not
# destinations and must never be read as such.
AxisKind = Literal["partition", "classification"]


class Amount(BaseModel):
    # Decimal, not float: this is what `units.to_rupees` converts to exact
    # integer rupees. TS reconstructs a decimal string from a JS float via
    # `String(value)`, which happens to round-trip for this dataset's figures
    # but is fragile in principle; reading straight into Decimal (via
    # `json.loads(text, parse_float=Decimal)` in `load.py`) is exact by
    # construction and carries no such assumption.
    value: Decimal = Field(ge=0, allow_inf_nan=False)
    unit: Unit


class Citation(BaseModel):
    """Which document a figure came from, and where inside it."""

    sourceId: Id
    locator: NonEmptyStr


# ------------------------------------------------------------------- input --


class Source(BaseModel):
    id: Id
    publisher: NonEmptyStr
    documentTitle: NonEmptyStr
    canonicalUrl: str = Field(pattern=r"^https://\S+$")
    period: Period
    status: Status
    documentKind: DocumentKind
    unit: Unit
    retrievedAt: IsoDate
    # A bare filename, not a path: where the cache lives is the pipeline's
    # business (`paths.CACHE_DIR`), not something the authored manifest should
    # be re-stating 136 times. The pattern still forbids a slash, so a manifest
    # entry can never escape the cache directory.
    file: str = Field(pattern=r"^[A-Za-z0-9._-]+$")
    checksumSha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    # `checksum` (default) — a static published file; re-downloading must
    # reproduce checksumSha256 exactly, and a mismatch is a hard failure.
    # `unstable` — a server-rendered page whose bytes change on every request;
    # no figure may cite one, they exist only as cross-references.
    verification: Literal["checksum", "unstable"] = "checksum"
    verificationNote: NonEmptyStr | None = None
    notes: NonEmptyStr | None = None


class SourcesManifest(BaseModel):
    sources: list[Source] = Field(min_length=1)


class Fact(BaseModel):
    """A published figure — the only thing in the dataset that carries an
    amount. Facts are held in one flat list per section rather than nested
    inside each other, so no amount is ever written twice."""

    id: Id
    # Optional because most sections say a fact's label once, in that
    # section's section.json, rather than re-authoring it in every period
    # file — that re-authoring is what let one demand carry five different
    # names across five individually-valid files. Set here only when the
    # section has no such registry, which today means a single-period
    # section with nothing to drift.
    label: NonEmptyStr | None = None
    amount: Amount
    # How this money's destination is decided — a Finance Commission award
    # with no union discretion, versus a conditional loan a state draws only
    # by qualifying. The single most informative field for a reader.
    basis: NonEmptyStr | None = None
    cite: list[Citation] = Field(min_length=1)
    notes: NonEmptyStr | None = None


class TreeNode(BaseModel):
    """A named group holding more nodes. Carries no amount and never can —
    its subtotal is summed from what is underneath it."""

    group: Id
    children: list[Id | TreeNode] = Field(min_length=1)


TreeNode.model_rebuild()


class SignedAmount(BaseModel):
    """An amount that may be negative, for the one place a source publishes
    one. Everywhere else `Amount` applies and money spent cannot be below
    zero.

    Statement 3 prints net capital expenditure, and a body whose capital
    receipts and recoveries exceed its capital outlay in a year nets out
    negative — the Election Commission's capital column is -5.00 crore in
    2022-23 and -30.05 crore in 2024-25. That is the government's own
    published figure, and Revenue + Capital still equals the Total exactly in
    both years, so the sum rule is untouched. Rejecting it would mean
    dropping a split the document plainly states.

    This is deliberately narrow: it is the part of a decomposition that may be
    signed, never a fact's own amount.
    """

    value: Decimal = Field(allow_inf_nan=False)
    unit: Unit


class ClassificationPart(BaseModel):
    """One inline part of a classification split — a group id from the
    axis's own vocabulary (`revenue` or `capital`) and its amount, printed as
    a column of the same row as the total rather than named in a separate
    document. See `Tree.parts`."""

    group: Id
    amount: SignedAmount


class DerivedBy(BaseModel):
    method: Id
    using: dict[str, str] = Field(default_factory=dict)


class Tree(BaseModel):
    """How a total is broken up. `of` is what is being decomposed (`@root` or
    a fact id); `axis` names the question being answered.

    The parts must sum exactly to what they decompose — that single rule
    replaces five separately-written ones, and it is where the dataset's
    trustworthiness comes from: the total and the parts almost always come
    from different documents, so their agreement is corroboration between
    two independent publications rather than arithmetic performed on
    ourselves.

    Exactly one of three shapes: `children` (listed), `derivedBy` (computed
    at build time from a published rule, never checked in), or `parts`
    (inline, for a classification axis whose parts are columns of the same
    row as their total — Revenue and Capital in Statement 3 — rather than
    named in a second document. Promoting each column to a full fact would
    invent a permanent id that buys no corroboration, because there is no
    second document for a same-row column to agree with). A tree using
    `parts` must carry `cite` itself, since the parts have none of their own.
    """

    of: Literal["@root"] | Id
    axis: Id
    children: list[Id | TreeNode] | None = Field(default=None, min_length=1)
    derivedBy: DerivedBy | None = None
    parts: list[ClassificationPart] | None = Field(default=None, min_length=1)
    cite: list[Citation] | None = None
    notes: NonEmptyStr | None = None

    @model_validator(mode="after")
    def _exactly_one_shape(self) -> Tree:
        shapes = (self.children, self.derivedBy, self.parts)
        if sum(1 for s in shapes if s is not None) != 1:
            raise ValueError(
                "a tree must declare exactly one of children, derivedBy, or parts"
            )
        return self

    @model_validator(mode="after")
    def _parts_need_cite(self) -> Tree:
        if self.parts is not None and not self.cite:
            raise ValueError(
                'a tree using "parts" must carry its own citation — the '
                "parts have none of their own"
            )
        return self


class SectionRoot(BaseModel):
    """The section's own total. `amount` is optional: when a document
    publishes it the trees below are checked against it; when none does, it
    is summed from the trees. `label`/`description` are not here — they are
    period-invariant and live once in the section's `section.json`."""

    amount: Amount | None = None
    cite: list[Citation] = Field(default_factory=list)


class SectionFile(BaseModel):
    """One period of one section. Every section in the dataset — expenditure,
    devolution, receipts, the cess earmark — is this shape."""

    section: Id
    period: Period
    status: Status
    perimeter: Perimeter
    perimeterOf: Id | None = None
    root: SectionRoot
    # Empty is legitimate: a section whose parts are entirely derived (the
    # per-state devolution split, say) authors no facts at all.
    facts: list[Fact] = Field(default_factory=list)
    trees: list[Tree] = Field(min_length=1)
    notes: NonEmptyStr | None = None


class SectionDefinitionLine(BaseModel):
    label: NonEmptyStr
    # The department's own official website — see `OfficialUrl`. A department
    # often has its own site distinct from its ministry's, which is why this
    # sits here and not only on the ministry group.
    url: OfficialUrl | None = None
    # Why this id's label needed a human decision — OCR damage, a merge.
    notes: NonEmptyStr | None = None


class SectionDefinition(BaseModel):
    """A section's period-invariant identity: its own label and description,
    and each fact id's label, written once for every period that carries it.
    One file per section directory, discovered the same way period files
    are."""

    section: Id
    label: NonEmptyStr
    description: NonEmptyStr
    lines: dict[Id, SectionDefinitionLine] = Field(default_factory=dict)


class Axis(BaseModel):
    id: Id
    label: NonEmptyStr
    description: NonEmptyStr
    kind: AxisKind
    # Which group vocabulary this axis's branch ids are drawn from.
    groups: Id | None = None


class AxisVocabulary(BaseModel):
    """Named axes, so "recipient" means the same thing everywhere it
    appears."""

    version: NonEmptyStr
    axes: list[Axis] = Field(min_length=1)


# The body's own official website. Optional, and the one field here that
# nothing can checksum: a live site can move or die, where every other claim
# in this dataset is pinned to a document whose bytes are recorded. It is
# therefore held to a weaker but explicit bar — a URL is only written after
# the page it serves has named itself as the body in question — and absence
# means "not corroborated", never "has no website".
OfficialUrl = Annotated[str, Field(pattern=r"^https://\S+$")]


class Group(BaseModel):
    id: Id
    label: NonEmptyStr
    description: NonEmptyStr
    url: OfficialUrl | None = None


class GroupVocabulary(BaseModel):
    """A named list of group ids with their labels. Labels live here and only
    here — they used to be written on each year's tree while descriptions
    came from the taxonomy, and the two drifted the first time a category
    was renamed."""

    id: Id
    version: NonEmptyStr
    groups: list[Group] = Field(min_length=1)


class LineItem(BaseModel):
    id: Id
    # One short line: what this body is, enough to tell it from its
    # neighbours. Names real things — the actual schemes and institutions the
    # demand funds — so it is a claim about a demand's contents, cited like
    # any other claim here.
    summary: NonEmptyStr | None = None
    # The longer, itemised account of what the money bought, with published
    # figures. Must be cited, because it quotes amounts.
    spentOn: NonEmptyStr | None = None
    cite: list[Citation] = Field(min_length=1)

    @model_validator(mode="after")
    def _says_something(self) -> LineItem:
        if not self.summary and not self.spentOn:
            raise ValueError(
                "a line item must say something: give it a summary, a "
                "spentOn, or both"
            )
        return self


class LineItemVocabulary(BaseModel):
    """What each budget head is actually spent on, keyed by fact id and
    written once, not per period."""

    id: Literal["line-items"]
    version: NonEmptyStr
    items: list[LineItem] = Field(min_length=1)
    notes: NonEmptyStr | None = None


class Share(BaseModel):
    id: Id
    label: NonEmptyStr
    # Percentage of the states' share, to three decimal places. Decimal so
    # `apportion`'s weight computation (`sharePercent * 1000`) is exact.
    sharePercent: Decimal = Field(gt=0, le=100, allow_inf_nan=False)


class Award(BaseModel):
    id: Id
    label: NonEmptyStr
    fromPeriod: Period
    toPeriod: Period
    # The states' collective share of the divisible pool, e.g. 41.
    divisiblePoolPercent: Decimal = Field(gt=0, le=100, allow_inf_nan=False)
    sourceId: Id
    sourceLocator: NonEmptyStr
    notes: NonEmptyStr | None = None
    shares: list[Share] = Field(min_length=1)


class FinanceCommission(BaseModel):
    """A Finance Commission's horizontal devolution shares — the input to the
    `finance-commission-shares` generator. Only percentages are authored; the
    per-state rupee amounts are derived at build time from a published
    total."""

    awards: list[Award] = Field(min_length=1)


class RevisionNote(BaseModel):
    version: NonEmptyStr
    date: IsoDate
    summary: NonEmptyStr
    affectedIds: list[str]


class DatasetManifest(BaseModel):
    """The dataset index. It no longer lists which periods exist: sections
    are discovered on disk."""

    schemaVersion: Literal[3]
    datasetVersion: str = Field(pattern=r"^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$")
    vocabularyVersions: dict[str, str]
    revisionNotes: list[RevisionNote]


# ------------------------------------------------------------------ output --


class DerivedNote(BaseModel):
    """Present when the amount was computed rather than read from a
    document. A consumer showing it should say so."""

    method: NonEmptyStr
    description: NonEmptyStr
    # The published percentage behind a derived share, where there is one.
    sharePercent: float | None = Field(default=None, gt=0)
    # The published inputs the generator used. A consumer needs these to
    # explain the figure without reaching back into files the artifact does
    # not carry.
    parameters: dict[str, str] | None = None


class ClassificationPartResolved(BaseModel):
    localId: NonEmptyStr
    label: NonEmptyStr
    # Signed, for the same reason `SignedAmount` is: net capital expenditure is
    # negative where a body's capital recoveries exceed its outlay. A consumer
    # rendering these as bar widths has to handle it; the alternative is
    # publishing a figure the source does not print.
    amountRupees: int


class ClassificationSplit(BaseModel):
    """Splits of a node's money by an attribute rather than a destination —
    revenue versus capital. Deliberately not children: they are not places
    the money went."""

    axis: NonEmptyStr
    # Where the split was published. Carried here because a classification
    # part never becomes a node of its own, so this is the only place its
    # provenance can live.
    cite: list[Citation] = Field(min_length=1)
    parts: list[ClassificationPartResolved]


class ResolvedNode(BaseModel):
    """A node in a resolved tree. Amounts are integer rupees. A group's
    amount is summed from its descendants; a fact's amount is published and
    already checked against whatever decomposes it."""

    # Globally unique: f"{section}:{period}:{axis}:{localId}"
    id: NonEmptyStr
    parentId: NonEmptyStr | None
    section: NonEmptyStr
    period: Period
    # The root axis this node was reached through, e.g. "purpose".
    lens: NonEmptyStr
    kind: Literal["group", "fact"]

    label: NonEmptyStr
    # Set on a group or a section root, never on a fact — `summary` is what a
    # fact says about itself.
    description: NonEmptyStr | None = None
    # The body's own official website, where one has been corroborated. See
    # `OfficialUrl`: absence means unverified, not absent.
    url: OfficialUrl | None = None
    depth: int = Field(ge=0)
    childIds: list[str]
    # The axis the children below this node are divided by, when it has any.
    childAxis: NonEmptyStr | None = None

    amountRupees: int = Field(ge=0)
    # Stable across periods: the authored id, unqualified.
    localId: NonEmptyStr

    sourceIds: list[str]
    # Set on facts: the citations backing the amount.
    cite: list[Citation] | None = None
    # Set on facts that declare it: how the destination is decided.
    basis: NonEmptyStr | None = None
    # One short line saying what this body is. Consumers should prefer it to
    # `description`.
    summary: NonEmptyStr | None = None
    # The longer, itemised account of what the money bought. Detail for
    # someone who has opened this node, not for a list of rows.
    spentOn: NonEmptyStr | None = None

    derived: DerivedNote | None = None
    classifications: list[ClassificationSplit] | None = None


class ResolvedSection(BaseModel):
    """One period of one section, resolved."""

    section: NonEmptyStr
    period: Period
    status: Status
    perimeter: Perimeter
    perimeterOf: NonEmptyStr | None = None
    label: NonEmptyStr
    description: NonEmptyStr

    totalRupees: int = Field(ge=0)
    # True when a document publishes this total, so the trees were checked.
    totalIsPublished: bool

    # The root axes this section can be viewed along, mapped to their root
    # node. Expenditure has two (purpose, administrative) and they
    # necessarily agree, because each covers exactly the same facts.
    rootIds: dict[str, str]
    nodes: dict[str, ResolvedNode]
    factCount: int = Field(ge=0)


class ResolvedAxis(BaseModel):
    id: NonEmptyStr
    label: NonEmptyStr
    description: NonEmptyStr
    kind: AxisKind


class ResolvedDataset(BaseModel):
    schemaVersion: Literal[3]
    datasetVersion: NonEmptyStr
    builtAt: IsoDateTime

    sections: list[ResolvedSection]
    axes: list[ResolvedAxis]
    sources: list[Source]
    revisionNotes: list[RevisionNote]
