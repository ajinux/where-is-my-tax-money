"""Ported from `src/build/issues.ts`.

Validation reports a list of issues rather than throwing on the first one —
a contributor fixing a section should see everything wrong with it in one
run, not discover the next problem only after fixing the previous one.

Note how few of these there are, and in particular that there is exactly one
about sums. The previous schema had five — one each for lens roots, record
components, per-state splits, cess fund totals and revenue/capital
breakdowns — because every new kind of nesting arrived with its own bespoke
shape and therefore its own bespoke rule. They were all the same statement:
*the parts must sum to what they decompose*.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

IssueCode = Literal[
    "schema-invalid",
    # structure
    "duplicate-id",
    "dangling-reference",
    "orphaned-fact",
    "fact-referenced-twice",
    "partitions-disagree",
    "ambiguous-decomposition",
    # across periods — an id is supposed to mean one thing for all time
    "label-drift",
    "group-drift",
    "unknown-axis",
    "unknown-group",
    "unknown-line-item",
    "missing-label",
    "parts-on-partition-axis",
    # arithmetic
    "sum-mismatch",
    "amount-not-representable",
    # provenance
    "unknown-source-id",
    "unverifiable-source-cited",
    "uncited-source",
    "estimate-cited-as-actual",
    "uncorroborated-award",
    "award-period-mismatch",
    # sections
    "perimeter-undeclared",
    "unknown-generator",
    "generator-input-missing",
]


@dataclass(frozen=True, kw_only=True)
class DataIssue:
    code: IssueCode
    message: str
    section: str | None = None
    period: str | None = None
    axis: str | None = None
    factId: str | None = None
    sourceId: str | None = None
    expected: str | None = None
    observed: str | None = None


def format_issue(issue: DataIssue) -> str:
    scope = " / ".join(
        filter(None, [issue.section, issue.period, issue.axis, issue.factId])
    )
    detail = ""
    if issue.expected is not None or issue.observed is not None:
        expected = issue.expected if issue.expected is not None else "—"
        observed = issue.observed if issue.observed is not None else "—"
        detail = f" (expected {expected}, got {observed})"
    prefix = f" {scope}:" if scope else ""
    return f"  [{issue.code}]{prefix} {issue.message}{detail}"


class DataValidationError(Exception):
    def __init__(self, issues: list[DataIssue]) -> None:
        self.issues = issues
        message = (
            f"dataset validation failed with {len(issues)} issue(s):\n"
            + "\n".join(format_issue(i) for i in issues)
        )
        super().__init__(message)
