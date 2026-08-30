"""Ported from `scripts/fetch-sources.ts`. Download every source document
listed in dataset/sources.json into .cache/sources/ and verify its
checksum.

The documents themselves are never committed — they are large government
PDFs — but anyone can run this and confirm the dataset's figures came from
the documents it claims.

Pass `--force` to re-download files that are already present and valid.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

from ..paths import CACHE_DIR, SOURCES_MANIFEST
from ..schema import SourcesManifest
from ..sources import check_source, sha256

USER_AGENT = "wimtm-data/2.0 (+https://whereismytaxmoney.com)"


def run(force: bool) -> int:
    manifest = SourcesManifest.model_validate(
        json.loads(SOURCES_MANIFEST.read_text(encoding="utf-8"))
    )

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    failures = 0

    for source in manifest.sources:
        if not force and check_source(CACHE_DIR, source).status == "ok":
            print(f"  cached    {source.id}")
            continue

        print(f"  fetching  {source.id} ... ", end="", flush=True)
        request = urllib.request.Request(
            source.canonicalUrl, headers={"User-Agent": USER_AGENT}
        )
        try:
            with urllib.request.urlopen(request) as response:  # noqa: S310
                data = response.read()
        except (urllib.error.URLError, urllib.error.HTTPError) as error:
            failures += 1
            print("FAILED")
            print(f"            {error}", file=sys.stderr)
            continue

        observed = sha256(data)
        if observed != source.checksumSha256:
            # The URL resolved but the bytes differ. Either the publisher
            # replaced the document or the manifest is stale; both need a
            # human, so the file is not written and the recorded figures
            # stay unverified.
            failures += 1
            print("CHECKSUM MISMATCH")
            print(
                f"            expected {source.checksumSha256}\n"
                f"            observed {observed}\n"
                "            not saved — the document at this URL is not "
                "the one the figures came from",
                file=sys.stderr,
            )
            continue

        (CACHE_DIR / source.file).write_bytes(data)
        print(f"ok ({round(len(data) / 1024)} KB)")

    print(
        f"\n{len(manifest.sources) - failures}/{len(manifest.sources)} "
        "source documents available in .cache/sources/"
    )
    return 1 if failures > 0 else 0


def main() -> None:
    force = "--force" in sys.argv
    sys.exit(run(force))


if __name__ == "__main__":
    main()
