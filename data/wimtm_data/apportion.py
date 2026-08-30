"""Ported from `src/build/apportion.ts`.

Split a total across weighted parts so the parts sum to the total *exactly*,
by the largest-remainder method: round each share down, then give the
leftover rupees one at a time to the parts with the largest fractional
claim. Ties break by index, so the same input always produces the same
artifact, byte for byte.

Python ints are already arbitrary-precision, so the BigInt ceremony the TS
version needs disappears — this is a straight port of the algorithm, not of
the type machinery around it.
"""

from __future__ import annotations


def apportion(total: int, weights: list[int]) -> list[int]:
    weight_sum = sum(weights)
    if weight_sum <= 0:
        raise ValueError("cannot apportion across weights that sum to zero")

    amounts = [(total * w) // weight_sum for w in weights]
    leftover = total - sum(amounts)

    # Largest remainder first; equal remainders keep their original order.
    by_remainder = sorted(
        range(len(weights)),
        key=lambda i: (-(total * weights[i] % weight_sum), i),
    )

    for i in range(leftover):
        index = by_remainder[i]
        amounts[index] += 1

    return amounts
