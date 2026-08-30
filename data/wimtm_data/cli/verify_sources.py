"""Ported from `scripts/verify-sources.ts`. Check every cached source
document against its recorded checksum. Run `sources-fetch` first — the
documents are not committed."""

from __future__ import annotations

import json
import sys

from ..paths import CACHE_DIR, SOURCES_MANIFEST
from ..schema import SourcesManifest
from ..sources import check_source


def run() -> int:
    manifest = SourcesManifest.model_validate(
        json.loads(SOURCES_MANIFEST.read_text(encoding="utf-8"))
    )

    verified = skipped = missing = mismatched = 0

    for source in manifest.sources:
        result = check_source(CACHE_DIR, source)
        if result.status == "ok":
            verified += 1
            print(f"  ok        {source.id}")
        elif result.status == "skipped":
            skipped += 1
            print(f"  skipped   {source.id}  (not byte-stable; cross-reference only)")
        elif result.status == "missing":
            missing += 1
            print(f"  missing   {source.id}  ({source.file})")
        elif result.status == "mismatch":
            mismatched += 1
            print(
                f"  MISMATCH  {source.id}\n"
                f"            expected {source.checksumSha256}\n"
                f"            observed {result.observed}",
                file=sys.stderr,
            )

    checkable = sum(1 for s in manifest.sources if s.verification == "checksum")
    summary = f"\n{verified}/{checkable} checksummable sources verified"
    if skipped:
        summary += f", {skipped} not byte-stable"
    if missing:
        summary += f", {missing} not downloaded"
    if mismatched:
        summary += f", {mismatched} MISMATCHED"
    print(summary)

    # A missing file just means it has not been fetched. A mismatch means
    # the document behind the URL is not the one these figures came from,
    # which makes every number citing it unverifiable — that is a failure.
    return 1 if mismatched > 0 else 0


def main() -> None:
    sys.exit(run())


if __name__ == "__main__":
    main()
