"""Emit golden fixtures for the TypeScript port of the allocation maths.

The split depends on the figure a reader types, so it cannot be precomputed into
the dataset — which means the same largest-remainder algorithm exists three
times: data/wimtm_data/apportion.py, web/scripts/allocate.py, and
web/src/lib/allocate.ts. Three copies agreeing by inspection is not evidence, so
the Python generates cases here and the Node suite asserts the TS reproduces them
exactly.

Cases are chosen to include the ones that break a naive port: the intermediate
`total * weight` on real national figures overflows JavaScript's safe integer
range by eleven orders of magnitude.

Run: python3 web/scripts/gen-fixtures.py
"""

from __future__ import annotations

import json
from pathlib import Path

from allocate import apportion, decompose, route

ROOT = Path(__file__).resolve().parent.parent.parent

dataset = json.loads((ROOT / "data" / "dist" / "dataset.v3.json").read_text())
sections = {(e["section"], e["period"]): e for e in dataset["sections"]}

expenditure = sections[("union-expenditure", "2025-26")]
nodes = expenditure["nodes"]


def group_weights(lens: str) -> list[int]:
    root = nodes[expenditure["rootIds"][lens]]
    return sorted((nodes[c]["amountRupees"] for c in root["childIds"]), reverse=True)


purpose = group_weights("purpose")
administrative = group_weights("administrative")
largest = max(purpose)

apportion_cases = [
    {"why": "even split, no remainder", "total": 99, "weights": [1, 1, 1]},
    {"why": "remainder goes to the largest fractional claim", "total": 100, "weights": [1, 1, 1]},
    {"why": "exact tie breaks by index", "total": 10, "weights": [1, 1, 1, 1]},
    {"why": "one weight takes everything", "total": 12345, "weights": [7, 0, 0]},
    {"why": "a realistic tax across the 11 purpose groups", "total": 120000, "weights": purpose},
    {"why": "the same across all 56 ministries", "total": 120000, "weights": administrative},
    {"why": "small tax, many heads: most parts land on zero", "total": 57, "weights": administrative},
    {
        "why": "national magnitudes — total*weight is ~2.5e27, far past Number.MAX_SAFE_INTEGER",
        "total": largest,
        "weights": [largest, 1],
    },
    {
        "why": "whole union budget split across every ministry",
        "total": sum(administrative),
        "weights": administrative,
    },
]

for case in apportion_cases:
    case["expected"] = apportion(case["total"], case["weights"])

tax_cases = []
for paid in (25_000, 57, 120_000, 600_000, 4_675_311):
    for surcharge in (0.0, 0.10, 0.15, 0.25, 0.37):
        tax_cases.append(
            {
                "paid": paid,
                "surcharge": surcharge,
                "decompose": decompose(paid, surcharge),
                "route": route(paid, surcharge, 41.0),
            }
        )

# --- end to end, against the real dataset -------------------------------------
#
# The strongest check available: run the whole journey in Python — decompose the
# payment, route it, then apportion the Union's share across that year's real
# spending heads — and require the TypeScript to land on the same rupees. This
# covers the data transform and the allocation together, which is where a
# plausible-looking mistake would otherwise hide.


def by_size(entry: dict, node_ids: list[str]) -> list[dict]:
    """Biggest first, ties broken by id — the order build-data.mjs emits."""
    rows = [entry["nodes"][nid] for nid in node_ids]
    return sorted(rows, key=lambda n: (-n["amountRupees"], n["localId"]))


journeys = []
for period in sorted({e["period"] for e in dataset["sections"]}):
    exp = sections[("union-expenditure", period)]
    dev = sections[("tax-devolution", period)]
    cess_section = sections[("cess-earmark", period)]

    pool_percent = None
    for node in dev["nodes"].values():
        value = (node.get("derived") or {}).get("parameters", {}).get("divisiblePoolPercent")
        if value is not None:
            pool_percent = float(value)
            break

    for paid, surcharge in ((120_000, 0.0), (25_000, 0.10), (4_675_311, 0.37)):
        flow = route(paid, surcharge, pool_percent)
        entry = {
            "period": period,
            "paid": paid,
            "surcharge": surcharge,
            "toStates": flow["to_states"],
            "toCess": flow["to_cess"],
            "toUnion": flow["to_union"],
            "lenses": {},
        }
        for lens in ("purpose", "administrative"):
            groups = by_size(exp, exp["nodes"][exp["rootIds"][lens]]["childIds"])
            parts = apportion(flow["to_union"], [g["amountRupees"] for g in groups])
            entry["lenses"][lens] = [
                {"id": g["localId"], "yours": part} for g, part in zip(groups, parts, strict=True)
            ]

        states = by_size(dev, dev["nodes"][dev["rootIds"]["recipient"]]["childIds"])
        state_parts = apportion(flow["to_states"], [s["amountRupees"] for s in states])
        entry["states"] = [
            {"id": s["localId"], "yours": part}
            for s, part in zip(states, state_parts, strict=True)
        ]

        cess_root = cess_section["nodes"][cess_section["rootIds"]["destination"]]
        cess_rows = by_size(cess_section, cess_root["childIds"])
        cess_parts = apportion(flow["to_cess"], [c["amountRupees"] for c in cess_rows])
        entry["cess"] = [
            {"id": c["localId"], "yours": part}
            for c, part in zip(cess_rows, cess_parts, strict=True)
        ]

        journeys.append(entry)

out = ROOT / "web" / "tests" / "fixtures.json"
out.write_text(
    json.dumps(
        {"apportion": apportion_cases, "tax": tax_cases, "journeys": journeys},
        indent=1,
    )
)
print(
    f"wrote {out.relative_to(ROOT)}: {len(apportion_cases)} apportion, "
    f"{len(tax_cases)} tax, {len(journeys)} end-to-end journeys"
)
