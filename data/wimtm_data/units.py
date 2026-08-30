"""Ported from `src/build/units.ts`.

TS goes through a decimal *string* because JS has no exact decimal type —
`73008.1 * 1e7` is not exactly `730081000000` in IEEE-754, so `toRupees`
reconstructs the string from `String(value)` and shifts the digits instead
of multiplying. Python's `Decimal` is exact natively, so the workaround
disappears: `to_rupees` here just reads the digits already in the value,
which is exact as long as `Amount.value` reached this function as a
`Decimal` parsed from the source JSON text rather than through a `float`
(see `load.py`'s `parse_float=Decimal`).
"""

from __future__ import annotations

import re
from decimal import Decimal

from .schema import Unit

_SCALE: dict[str, int] = {"rupees": 0, "lakh-rupees": 5, "crore-rupees": 7}

# A leading minus is allowed because Statement 3 publishes net capital
# expenditure, which is negative for a body whose capital recoveries exceed its
# outlay in a year. Only `SignedAmount` (classification parts) can carry one —
# `Amount.value` is still `ge=0`, so no fact's own amount reaches here negative.
_PLAIN_DECIMAL = re.compile(r"-?\d+(?:\.\d+)?")


class UnitConversionError(ValueError):
    pass


def to_rupees(value: Decimal, unit: Unit) -> int:
    """Convert a source figure to exact integer rupees."""
    scale = _SCALE[unit]
    text = str(value)

    if not _PLAIN_DECIMAL.fullmatch(text):
        raise UnitConversionError(
            f"cannot convert {text} exactly (expected a plain decimal)"
        )

    # Split the sign off before shifting digits: the exactness of this function
    # comes from moving the decimal point in the source's own digits, and that
    # is a property of the digits, not of the sign.
    negative = text.startswith("-")
    int_part, _, frac_part = text.lstrip("-").partition(".")
    if len(frac_part) > scale:
        raise UnitConversionError(
            f"{text} {unit} is finer than one rupee; the dataset cannot "
            "represent it exactly"
        )

    rupees = int(int_part + frac_part.ljust(scale, "0"))
    return -rupees if negative else rupees


# Number.MAX_SAFE_INTEGER. Python ints have no such ceiling, but the artifact
# is JSON consumed by other languages, so the same safety margin is kept —
# `rupees_to_number` is a bounds check, not a narrowing conversion.
_MAX_SAFE_INTEGER = 2**53 - 1


def rupees_to_number(rupees: int) -> int:
    if abs(rupees) > _MAX_SAFE_INTEGER:
        raise UnitConversionError(
            f"{rupees} rupees exceeds the safe integer range and would lose "
            "precision as JSON"
        )
    return rupees
