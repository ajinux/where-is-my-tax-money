"""Mirrors sources.ts's behaviour: checksum, expressed as three outcomes."""

import hashlib
from pathlib import Path

from wimtm_data.schema import Source
from wimtm_data.sources import check_source, sha256


def _source(**overrides: object) -> Source:
    base = dict(
        id="test-source",
        publisher="P",
        documentTitle="T",
        canonicalUrl="https://example.gov.in/x.pdf",
        period="2024-25",
        status="actual-final",
        documentKind="budget-document",
        unit="crore-rupees",
        retrievedAt="2026-01-01",
        file="x.pdf",
        checksumSha256="a" * 64,
    )
    base.update(overrides)
    return Source.model_validate(base)


def test_sha256_matches_hashlib() -> None:
    data = b"hello"
    assert sha256(data) == hashlib.sha256(data).hexdigest()


def test_unstable_sources_are_skipped_without_touching_disk(tmp_path: Path) -> None:
    source = _source(verification="unstable")
    result = check_source(tmp_path, source)
    assert result.status == "skipped"


def test_missing_file_is_reported(tmp_path: Path) -> None:
    source = _source()
    result = check_source(tmp_path, source)
    assert result.status == "missing"


def test_checksum_match_and_mismatch(tmp_path: Path) -> None:
    # tmp_path *is* the cache directory: check_source is handed where the
    # documents live, rather than deriving it from a package root.
    data = b"the document bytes"
    (tmp_path / "x.pdf").write_bytes(data)

    matching = _source(checksumSha256=sha256(data))
    assert check_source(tmp_path, matching).status == "ok"

    mismatching = _source(checksumSha256="b" * 64)
    result = check_source(tmp_path, mismatching)
    assert result.status == "mismatch"
    assert result.observed == sha256(data)
