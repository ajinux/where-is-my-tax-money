"""Shared CLI formatting: Indian digit grouping, since Python's `locale`
cannot be relied on to have `en_IN` installed and `f"{n:,}"` gives the
Western grouping. Same algorithm as `web/scripts/allocate.py`'s
`group_indian`."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal


def group_indian(digits: str) -> str:
    """1286885 -> 12,86,885: last three digits, then pairs."""
    if len(digits) <= 3:
        return digits
    head, tail = digits[:-3], digits[-3:]
    parts: list[str] = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts) + "," + tail


def crore(rupees: int) -> str:
    """Rupees as crore, Indian-grouped, up to 2 decimals with trailing
    zeros dropped — mirrors TS's
    `(n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })`."""
    value = (Decimal(rupees) / Decimal(10_000_000)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    sign = "-" if value < 0 else ""
    int_part, _, frac_part = str(abs(value)).partition(".")
    frac_part = frac_part.rstrip("0")
    grouped = group_indian(int_part)
    return f"{sign}{grouped}{'.' + frac_part if frac_part else ''}"
