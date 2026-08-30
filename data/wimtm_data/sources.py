"""Ported from `src/build/sources.ts`.

Confirm a locally cached document is byte-for-byte the one the figures were
read from — the whole point of committing a manifest instead of the PDFs.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from .schema import Source


@dataclass(frozen=True, kw_only=True)
class SourceCheck:
    status: Literal["ok", "skipped", "missing", "mismatch"]
    source: Source
    observed: str | None = None


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def check_source(cache_dir: Path, source: Source) -> SourceCheck:
    # A server-rendered page returns different bytes every request, so there
    # is nothing to check. Validation guarantees no figure depends on one.
    if source.verification == "unstable":
        return SourceCheck(status="skipped", source=source)

    path = cache_dir / source.file
    if not path.exists():
        return SourceCheck(status="missing", source=source)

    observed = sha256(path.read_bytes())
    if observed != source.checksumSha256:
        return SourceCheck(status="mismatch", source=source, observed=observed)
    return SourceCheck(status="ok", source=source)
