"""Entry points, one per verb.

    wimtm-data validate
    wimtm-data build
    wimtm-data schema-json
    wimtm-data sources-fetch [--force]
    wimtm-data sources-verify

The verb names mirror the `npm run <name>` scripts this package had before the
pipeline was ported to Python, so the mental model carried over unchanged.
Those scripts are long gone — the repo has no npm at all now.
"""

from __future__ import annotations

import argparse
import sys

from . import build, fetch_sources, schema_json, validate, verify_sources


def main() -> None:
    parser = argparse.ArgumentParser(prog="wimtm-data")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("validate", help="check every dataset rule")
    subparsers.add_parser("build", help="write dist/dataset.v3.json")
    subparsers.add_parser(
        "schema-json", help="regenerate JSON Schema from the Pydantic models"
    )
    fetch_parser = subparsers.add_parser(
        "sources-fetch", help="download source PDFs, verify checksums"
    )
    fetch_parser.add_argument("--force", action="store_true")
    subparsers.add_parser(
        "sources-verify", help="re-check already-downloaded documents"
    )

    args = parser.parse_args()

    if args.command == "validate":
        sys.exit(validate.run())
    elif args.command == "build":
        sys.exit(build.run())
    elif args.command == "schema-json":
        schema_json.run()
    elif args.command == "sources-fetch":
        sys.exit(fetch_sources.run(args.force))
    elif args.command == "sources-verify":
        sys.exit(verify_sources.run())


if __name__ == "__main__":
    main()
