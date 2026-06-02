import pytest

from app.services.loyalty import LoyaltyService


def test_calculate_earned_points_uses_minor_units() -> None:
    assert LoyaltyService.calculate_earned_points(100_00, 5) == 5
    assert LoyaltyService.calculate_earned_points(1250_50, 10) == 125


def test_calculate_max_redeem_points_uses_minor_units() -> None:
    assert LoyaltyService.calculate_max_redeem_points(100_00, 50) == 50


def test_calculate_points_rejects_non_positive_amounts() -> None:
    with pytest.raises(ValueError):
        LoyaltyService.calculate_earned_points(0, 5)


def test_earn_amount_after_redeem() -> None:
    assert LoyaltyService.earn_amount_after_redeem(200_000, 45) == 199_955
    assert LoyaltyService.earn_amount_after_redeem(100_00, 0) == 100_00
    assert LoyaltyService.earn_amount_after_redeem(50_00, 60_00) == 0
