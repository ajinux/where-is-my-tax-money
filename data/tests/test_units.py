"""Mirrors src/build/units.test.ts case for case."""

from decimal import Decimal

import pytest

from wimtm_data.units import UnitConversionError, rupees_to_number, to_rupees


def test_converts_whole_units() -> None:
    assert to_rupees(Decimal("1"), "rupees") == 1
    assert to_rupees(Decimal("1"), "lakh-rupees") == 100_000
    assert to_rupees(Decimal("1"), "crore-rupees") == 10_000_000


def test_converts_fractional_crore_exactly_where_floating_point_would_not() -> None:
    # 73008.1 * 1e7 is not exactly 730081000000 in IEEE-754 arithmetic — the
    # whole reason this function exists rather than a multiply.
    assert to_rupees(Decimal("73008.1"), "crore-rupees") == 730_081_000_000
    assert to_rupees(Decimal("129933.47"), "crore-rupees") == 1_299_334_700_000


def test_sums_fractional_amounts_without_drift() -> None:
    parts = [
        to_rupees(Decimal(v), "crore-rupees") for v in ("0.1", "0.2", "0.3", "0.4")
    ]
    assert sum(parts) == to_rupees(Decimal("1"), "crore-rupees")


def test_converts_negative_amounts_with_the_same_exactness() -> None:
    # Statement 3 publishes net capital expenditure, which goes negative when a
    # body's capital recoveries exceed its outlay — the Election Commission's
    # actuals are -5.00 crore in 2022-23 and -30.05 crore in 2024-25. Only a
    # classification part can carry a sign (see `SignedAmount`); the digits are
    # shifted exactly either way.
    assert to_rupees(Decimal("-5.00"), "crore-rupees") == -50_000_000
    assert to_rupees(Decimal("-30.05"), "crore-rupees") == -300_500_000
    assert to_rupees(Decimal("-1"), "rupees") == -1


def test_a_negative_part_still_closes_against_its_total() -> None:
    # The point of allowing the sign at all: the sum rule is untouched by it.
    revenue = to_rupees(Decimal("319.06"), "crore-rupees")
    capital = to_rupees(Decimal("-30.05"), "crore-rupees")
    assert revenue + capital == to_rupees(Decimal("289.01"), "crore-rupees")


def test_refuses_amounts_finer_than_one_rupee() -> None:
    with pytest.raises(UnitConversionError):
        to_rupees(Decimal("1.000000001"), "crore-rupees")
    with pytest.raises(UnitConversionError):
        to_rupees(Decimal("0.001"), "rupees")


def test_rupees_to_number_passes_through_the_safe_range() -> None:
    assert rupees_to_number(46_528_674_000_000) == 46_528_674_000_000


def test_rupees_to_number_refuses_values_json_would_silently_round() -> None:
    with pytest.raises(UnitConversionError):
        rupees_to_number(2**53)  # MAX_SAFE_INTEGER + 1
