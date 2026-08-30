"""Mirrors src/build/apportion.test.ts case for case."""

import pytest

from wimtm_data.apportion import apportion


def test_splits_a_total_that_divides_evenly() -> None:
    assert apportion(100, [1, 1, 1, 1]) == [25, 25, 25, 25]


def test_always_returns_parts_that_sum_to_the_total_exactly() -> None:
    # 100 does not divide by 3, so naive rounding would lose or invent a unit.
    parts = apportion(100, [1, 1, 1])
    assert sum(parts) == 100
    assert parts == [34, 33, 33]


def test_gives_the_leftover_to_the_largest_fractional_claim() -> None:
    # Weights 1:1:2 over 9 -> bases 2, 2, 4 with one unit left over. The
    # third part has the largest remainder, so it takes it.
    assert apportion(9, [1, 1, 2]) == [2, 2, 5]


def test_breaks_ties_by_index_so_the_artifact_is_reproducible() -> None:
    # Two identical remainders, one unit to give: the earlier index wins.
    assert apportion(3, [1, 1]) == [2, 1]


def test_conserves_a_realistic_devolution_split_to_the_rupee() -> None:
    total = 12_868_850_000_000
    shares = [17.939, 10.058, 7.85, 6.317, 3.647, 0.386]
    rest = 100 - sum(shares)
    weights = [round(s * 1000) for s in (*shares, rest)]

    parts = apportion(total, weights)
    assert sum(parts) == total
    # Uttar Pradesh's 17.939% of Rs 12,86,885 crore, to the rupee.
    assert parts[0] == 2_308_543_001_500


def test_is_deterministic_across_runs() -> None:
    weights = [3647, 10058, 7850, 78445]
    assert apportion(1_000_003, weights) == apportion(1_000_003, weights)


def test_refuses_weights_that_sum_to_zero() -> None:
    with pytest.raises(ValueError, match="sum to zero"):
        apportion(100, [0, 0])
