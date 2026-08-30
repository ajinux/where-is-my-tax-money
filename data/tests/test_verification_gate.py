"""The committed artifact must be the one this pipeline currently produces.

This test began as the proof of the TypeScript-to-Python port: it asserted the
Python build was byte-for-byte identical to the committed TS-built artifact.
That claim is spent — the TypeScript implementation is gone, and the committed
artifact has since been rebuilt by this pipeline, so the comparison is now
Python against Python.

What it still catches is worth keeping, and is why the file survives rather
than being deleted: `dist/dataset.v3.json` is checked in and read by consumers
(`web/`) who never run the build. A change to `resolve.py`, to a vocabulary, or
to any section file that was never rebuilt into the artifact leaves those
consumers reading something the dataset no longer says. The reasoning that made
the original gate strong applies unchanged: a subtle resolver bug can pass every
unit test while still producing a wrong artifact on the real corpus, because
tests exercise the rules, not the corpus.

When this fails because the inputs legitimately changed, the fix is
`uv run wimtm-data build` and committing the result — not editing this test.
"""

from __future__ import annotations

import json
import re
from datetime import datetime

import pytest

from wimtm_data import build_dataset
from wimtm_data.paths import ARTIFACT, DATASET_DIR

COMMITTED_ARTIFACT = ARTIFACT

# Legitimately different on every build — metadata about the build, not data.
_BUILT_AT_RE = re.compile(r'"builtAt":"[^"]*"')


def _normalise(text: str) -> str:
    return _BUILT_AT_RE.sub('"builtAt":"X"', text, count=1)


def test_committed_artifact_matches_a_fresh_build() -> None:
    if not COMMITTED_ARTIFACT.exists():
        pytest.skip(
            "dist/dataset.v3.json is not built — run `uv run wimtm-data build`"
        )

    committed = COMMITTED_ARTIFACT.read_text(encoding="utf-8")
    committed_built_at = json.loads(committed)["builtAt"]

    dataset, _ = build_dataset(
        DATASET_DIR, datetime.fromisoformat(committed_built_at.replace("Z", "+00:00"))
    )
    freshly_built = dataset.model_dump_json(exclude_unset=True)

    assert _normalise(freshly_built) == _normalise(committed), (
        "the committed dist/dataset.v3.json is not what this pipeline now "
        "produces — consumers read the committed file, so this is a real "
        "divergence, not a stylistic one. If the inputs changed on purpose, "
        "run `uv run wimtm-data build` and commit the artifact; if they did "
        "not, find the first byte that differs and treat it as a bug."
    )
