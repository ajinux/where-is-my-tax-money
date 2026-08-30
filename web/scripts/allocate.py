"""The allocation maths, in Python, as the reference the TypeScript is checked against.

`src/lib/allocate.ts` is a port of this file. Two implementations of the same
arithmetic agreeing by inspection is not evidence, so `gen-fixtures.py` runs
these functions over real national figures and the Node suite asserts the port
reproduces them exactly. That check has caught a real defect: the intermediate
`total * weight` overflows JavaScript's safe integer range by eleven orders of
magnitude on the actual amounts, which is why the port uses BigInt.

This lived in `prototype/allocate.py` until the prototype was deleted. It is
stdlib-only and must stay that way: CI runs `npm run fixtures` under a bare
`python3` with no dependency install.

Everything works in **whole rupees**, which is also the precision the UI shows.
That is deliberate: if allocation ran in paise and the display truncated, a
parent of ₹20,330.96 would sit above children reading ₹7,504 + ₹4,120 + … =
₹20,328, and the subtotals would visibly fail to add up. Apportioning at display
precision makes what you see the thing that is conserved.

A leaf showing ₹0 therefore means "less than a rupee of your tax", which is
honest rather than hidden.
"""

from __future__ import annotations

# Mirrors data/wimtm_data/apportion.py — same algorithm, same tie-break, so the
# site splits money the same way the dataset does.


def apportion(total: int, weights: list[int]) -> list[int]:
    """Split `total` across `weights` so the parts sum to `total` exactly.

    Rounding each share independently leaves the parts a few paise short of the
    total. Largest-remainder hands the leftover to the parts with the biggest
    fractional claim, so nothing is invented or lost. Ties break by index, which
    keeps the result reproducible.
    """
    weight_sum = sum(weights)
    if weight_sum <= 0:
        raise ValueError("cannot apportion across weights that sum to zero")

    amounts = [(total * w) // weight_sum for w in weights]
    leftover = total - sum(amounts)

    order = sorted(
        range(len(weights)),
        key=lambda i: (-((total * weights[i]) % weight_sum), i),
    )
    for i in range(leftover):
        amounts[order[i]] += 1

    return amounts


# --- how an individual's tax payment is actually composed ---------------------
#
# A rupee of income tax is not one thing. Parliament levies a base tax, then a
# surcharge on high incomes, then a cess on top of both. Only the base tax enters
# the divisible pool that states get a share of — cess and surcharge are the
# Union's alone.
#
# That is the whole reason the headline "41% goes to states" overstates what
# states receive, and the reason this split is worth showing a taxpayer.

HEALTH_EDUCATION_CESS = 0.04  # 4% on tax plus surcharge, levied on everyone


def decompose(total_paid: int, surcharge_rate: float) -> dict[str, int]:
    """Split what someone paid back into base tax, surcharge and cess.

    Working backwards from the total, because that is the number a taxpayer
    actually knows:

        total = base x (1 + surcharge) x (1 + cess)

    Rounding is arranged so the three parts always add back to exactly what was
    entered — base absorbs the remainder rather than the display quietly losing
    a rupee.
    """
    divisor = (1 + surcharge_rate) * (1 + HEALTH_EDUCATION_CESS)
    base = round(total_paid / divisor)
    surcharge = round(base * surcharge_rate)
    cess = total_paid - base - surcharge  # absorbs any rounding drift

    return {"base": base, "surcharge": surcharge, "cess": cess}


def route(total_paid: int, surcharge_rate: float, states_share_percent: float) -> dict:
    """Trace where a taxpayer's money goes, in whole rupees that add up.

    Three destinations, because the three parts of a tax bill are governed
    differently:

    - **base tax** is shareable. The states take the Finance Commission's
      percentage; the rest funds the Union's general spending.
    - **surcharge** is ordinary Union money that simply is not shared. It
      finances anything the Union spends on.
    - **cess** is neither. It is levied for a stated purpose and credited to
      reserve funds that may finance only their own schemes, so it cannot fund
      general spending at all.

    `to_states + to_cess + to_union` is exactly what was paid.
    """
    parts = decompose(total_paid, surcharge_rate)
    to_states = round(parts["base"] * states_share_percent / 100)
    union_from_base = parts["base"] - to_states

    return {
        **parts,
        "shareable": parts["base"],
        "non_shareable": parts["surcharge"] + parts["cess"],
        "to_states": to_states,
        "to_cess": parts["cess"],
        "to_union": union_from_base + parts["surcharge"],
        "effective_state_percent": 100 * to_states / total_paid if total_paid else 0.0,
    }
