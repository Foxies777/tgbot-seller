from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models import AuditLog, HolidayBonus, LoyaltySettings, PointLot, Transaction, User
from app.models.enums import TransactionType


class LoyaltyError(Exception):
    """Base domain error for loyalty operations."""


class InsufficientPointsError(LoyaltyError):
    pass


class RedeemDisabledError(LoyaltyError):
    pass


@dataclass(frozen=True)
class LoyaltyResult:
    transaction: Transaction
    is_duplicate: bool = False


@dataclass(frozen=True)
class PurchaseResult:
    earn_transaction: Transaction | None
    redeem_transaction: Transaction | None
    is_duplicate: bool = False

    @property
    def primary_transaction(self) -> Transaction:
        if self.earn_transaction is not None:
            return self.earn_transaction
        if self.redeem_transaction is not None:
            return self.redeem_transaction
        raise RuntimeError("purchase produced no transactions")


class LoyaltyService:
    def __init__(self, session: AsyncSession, settings: Settings):
        self.session = session
        self.settings = settings

    async def get_settings(self) -> LoyaltySettings:
        result = await self.session.execute(
            select(LoyaltySettings).order_by(LoyaltySettings.id).limit(1)
        )
        loyalty_settings = result.scalar_one_or_none()
        if loyalty_settings is not None:
            return loyalty_settings

        loyalty_settings = LoyaltySettings(
            earn_percent=self.settings.default_earn_percent,
            max_redeem_percent=self.settings.max_redeem_percent,
            point_ttl_days=self.settings.point_ttl_days,
        )
        self.session.add(loyalty_settings)
        await self.session.flush()
        return loyalty_settings

    async def current_earn_percent(self, today: date | None = None) -> int:
        today = today or date.today()
        result = await self.session.execute(
            select(HolidayBonus)
            .where(
                HolidayBonus.is_active.is_(True),
                HolidayBonus.starts_on <= today,
                HolidayBonus.ends_on >= today,
            )
            .order_by(HolidayBonus.earn_percent.desc())
            .limit(1)
        )
        holiday_bonus = result.scalar_one_or_none()
        if holiday_bonus is not None:
            return holiday_bonus.earn_percent
        return (await self.get_settings()).earn_percent

    @staticmethod
    def calculate_earned_points(purchase_amount_minor: int, earn_percent: int) -> int:
        if purchase_amount_minor <= 0:
            raise ValueError("purchase_amount_minor must be positive")
        return purchase_amount_minor * earn_percent // 10_000

    @staticmethod
    def calculate_max_redeem_points(purchase_amount_minor: int, max_redeem_percent: int) -> int:
        if purchase_amount_minor <= 0:
            raise ValueError("purchase_amount_minor must be positive")
        return purchase_amount_minor * max_redeem_percent // 10_000

    @staticmethod
    def earn_amount_after_redeem(purchase_amount_minor: int, redeemed_points: int) -> int:
        return max(0, purchase_amount_minor - redeemed_points)

    async def process_purchase(
        self,
        *,
        user_id: int,
        seller_id: int | None,
        purchase_amount_minor: int,
        redeem_points: int,
        idempotency_key: str,
    ) -> PurchaseResult:
        earn_key = f"{idempotency_key}:earn"
        redeem_key = f"{idempotency_key}:redeem"

        duplicate_earn = await self._get_duplicate(earn_key)
        if duplicate_earn is not None:
            duplicate_redeem = await self._get_duplicate(redeem_key)
            return PurchaseResult(
                earn_transaction=duplicate_earn,
                redeem_transaction=duplicate_redeem,
                is_duplicate=True,
            )

        redeem_transaction: Transaction | None = None
        redeemed_points = 0
        if redeem_points > 0:
            redeem_result = await self.redeem_points(
                user_id=user_id,
                seller_id=seller_id,
                purchase_amount_minor=purchase_amount_minor,
                requested_points=redeem_points,
                idempotency_key=redeem_key,
            )
            redeem_transaction = redeem_result.transaction
            redeemed_points = abs(redeem_result.transaction.points_delta)
            if redeem_result.is_duplicate:
                duplicate_earn = await self._get_duplicate(earn_key)
                return PurchaseResult(
                    earn_transaction=duplicate_earn,
                    redeem_transaction=redeem_transaction,
                    is_duplicate=True,
                )

        earn_transaction: Transaction | None = None
        earn_amount = self.earn_amount_after_redeem(purchase_amount_minor, redeemed_points)
        if earn_amount > 0:
            earn_result = await self.earn_points(
                user_id=user_id,
                seller_id=seller_id,
                purchase_amount_minor=earn_amount,
                idempotency_key=earn_key,
            )
            earn_transaction = earn_result.transaction
            if earn_result.is_duplicate:
                return PurchaseResult(
                    earn_transaction=earn_transaction,
                    redeem_transaction=redeem_transaction,
                    is_duplicate=True,
                )

        if earn_transaction is None and redeem_transaction is None:
            raise ValueError("purchase produced no loyalty operations")

        return PurchaseResult(
            earn_transaction=earn_transaction,
            redeem_transaction=redeem_transaction,
        )

    async def earn_points(
        self,
        *,
        user_id: int,
        seller_id: int | None,
        purchase_amount_minor: int,
        idempotency_key: str,
        comment: str | None = None,
    ) -> LoyaltyResult:
        duplicate = await self._get_duplicate(idempotency_key)
        if duplicate is not None:
            return LoyaltyResult(transaction=duplicate, is_duplicate=True)

        user = await self._lock_user(user_id)
        percent = await self.current_earn_percent()
        points = self.calculate_earned_points(purchase_amount_minor, percent)
        transaction = await self._create_transaction(
            user=user,
            seller_id=seller_id,
            transaction_type=TransactionType.earn,
            purchase_amount_minor=purchase_amount_minor,
            points_delta=points,
            idempotency_key=idempotency_key,
            comment=comment,
            meta={"earn_percent": percent},
        )

        loyalty_settings = await self.get_settings()
        self.session.add(
            PointLot(
                user_id=user.id,
                transaction_id=transaction.id,
                original_points=points,
                remaining_points=points,
                expires_at=datetime.now(UTC) + timedelta(days=loyalty_settings.point_ttl_days),
            )
        )
        await self.session.flush()
        return LoyaltyResult(transaction=transaction)

    async def redeem_points(
        self,
        *,
        user_id: int,
        seller_id: int | None,
        purchase_amount_minor: int,
        requested_points: int,
        idempotency_key: str,
        comment: str | None = None,
    ) -> LoyaltyResult:
        duplicate = await self._get_duplicate(idempotency_key)
        if duplicate is not None:
            return LoyaltyResult(transaction=duplicate, is_duplicate=True)

        loyalty_settings = await self.get_settings()
        if not loyalty_settings.redeem_enabled:
            raise RedeemDisabledError("Redeem is disabled")

        user = await self._lock_user(user_id)
        max_redeem = self.calculate_max_redeem_points(
            purchase_amount_minor,
            loyalty_settings.max_redeem_percent,
        )
        points = min(requested_points, max_redeem)
        if points <= 0:
            raise ValueError("requested_points must be positive")
        if user.balance_points < points:
            raise InsufficientPointsError("Not enough points")

        transaction = await self._create_transaction(
            user=user,
            seller_id=seller_id,
            transaction_type=TransactionType.redeem,
            purchase_amount_minor=purchase_amount_minor,
            points_delta=-points,
            idempotency_key=idempotency_key,
            comment=comment,
            meta={"requested_points": requested_points, "max_redeem_points": max_redeem},
        )
        await self._consume_lots(user_id=user.id, points=points)
        return LoyaltyResult(transaction=transaction)

    async def adjust_points(
        self,
        *,
        user_id: int,
        points_delta: int,
        actor_id: str,
        idempotency_key: str,
        comment: str,
    ) -> LoyaltyResult:
        if points_delta == 0:
            raise ValueError("points_delta must not be zero")
        if not comment.strip():
            raise ValueError("comment is required for manual adjustments")

        duplicate = await self._get_duplicate(idempotency_key)
        if duplicate is not None:
            return LoyaltyResult(transaction=duplicate, is_duplicate=True)

        user = await self._lock_user(user_id)
        if user.balance_points + points_delta < 0:
            raise InsufficientPointsError("Adjustment would make balance negative")

        old_balance = user.balance_points
        transaction = await self._create_transaction(
            user=user,
            seller_id=None,
            transaction_type=TransactionType.adjustment,
            purchase_amount_minor=0,
            points_delta=points_delta,
            idempotency_key=idempotency_key,
            comment=comment,
            meta={"actor_id": actor_id},
        )

        if points_delta > 0:
            loyalty_settings = await self.get_settings()
            self.session.add(
                PointLot(
                    user_id=user.id,
                    transaction_id=transaction.id,
                    original_points=points_delta,
                    remaining_points=points_delta,
                    expires_at=datetime.now(UTC) + timedelta(days=loyalty_settings.point_ttl_days),
                )
            )
        else:
            await self._consume_lots(user_id=user.id, points=abs(points_delta))

        self.session.add(
            AuditLog(
                actor_type="admin",
                actor_id=actor_id,
                action="balance.adjust",
                entity_type="user",
                entity_id=str(user.id),
                old_value={"balance_points": old_balance},
                new_value={"balance_points": user.balance_points},
                comment=comment,
            )
        )
        await self.session.flush()
        return LoyaltyResult(transaction=transaction)

    async def grant_welcome_bonus(
        self,
        *,
        user_id: int,
        idempotency_key: str,
    ) -> LoyaltyResult | None:
        loyalty_settings = await self.get_settings()
        if (
            not loyalty_settings.welcome_bonus_enabled
            or loyalty_settings.welcome_bonus_points <= 0
        ):
            return None

        duplicate = await self._get_duplicate(idempotency_key)
        if duplicate is not None:
            return LoyaltyResult(transaction=duplicate, is_duplicate=True)

        user = await self._lock_user(user_id)
        transaction = await self._create_transaction(
            user=user,
            seller_id=None,
            transaction_type=TransactionType.adjustment,
            purchase_amount_minor=0,
            points_delta=loyalty_settings.welcome_bonus_points,
            idempotency_key=idempotency_key,
            comment="Welcome bonus",
            meta={"reason": "welcome_bonus"},
        )
        self.session.add(
            PointLot(
                user_id=user.id,
                transaction_id=transaction.id,
                original_points=loyalty_settings.welcome_bonus_points,
                remaining_points=loyalty_settings.welcome_bonus_points,
                expires_at=datetime.now(UTC) + timedelta(days=loyalty_settings.point_ttl_days),
            )
        )
        await self.session.flush()
        return LoyaltyResult(transaction=transaction)

    async def expire_points(self, *, now: datetime | None = None) -> list[Transaction]:
        now = now or datetime.now(UTC)
        result = await self.session.execute(
            select(PointLot.user_id)
            .where(PointLot.expires_at <= now, PointLot.remaining_points > 0)
            .distinct()
        )
        transactions: list[Transaction] = []
        for user_id in result.scalars():
            user = await self._lock_user(user_id)
            lots_result = await self.session.execute(
                select(PointLot)
                .where(
                    PointLot.user_id == user_id,
                    PointLot.expires_at <= now,
                    PointLot.remaining_points > 0,
                )
                .order_by(PointLot.expires_at.asc())
                .with_for_update()
            )
            lots = list(lots_result.scalars())
            expired_points = min(sum(lot.remaining_points for lot in lots), user.balance_points)
            if expired_points <= 0:
                continue

            lot_ids = [lot.id for lot in lots]
            transaction = await self._create_transaction(
                user=user,
                seller_id=None,
                transaction_type=TransactionType.expiration,
                purchase_amount_minor=0,
                points_delta=-expired_points,
                idempotency_key=generate_expiration_key(user.id, lot_ids),
                comment="Expired points",
                meta={"expired_lot_ids": lot_ids},
            )
            remaining = expired_points
            for lot in lots:
                used = min(lot.remaining_points, remaining)
                lot.remaining_points -= used
                remaining -= used
                if remaining <= 0:
                    break
            transactions.append(transaction)
        await self.session.flush()
        return transactions

    async def _get_duplicate(self, idempotency_key: str) -> Transaction | None:
        result = await self.session.execute(
            select(Transaction).where(Transaction.idempotency_key == idempotency_key)
        )
        return result.scalar_one_or_none()

    async def _lock_user(self, user_id: int) -> User:
        result = await self.session.execute(
            select(User).where(User.id == user_id).with_for_update()
        )
        return result.scalar_one()

    async def _create_transaction(
        self,
        *,
        user: User,
        seller_id: int | None,
        transaction_type: TransactionType,
        purchase_amount_minor: int,
        points_delta: int,
        idempotency_key: str,
        comment: str | None,
        meta: dict[str, object],
    ) -> Transaction:
        balance_before = user.balance_points
        user.balance_points += points_delta
        transaction = Transaction(
            user_id=user.id,
            seller_id=seller_id,
            transaction_type=transaction_type,
            purchase_amount_minor=purchase_amount_minor,
            points_delta=points_delta,
            balance_before=balance_before,
            balance_after=user.balance_points,
            idempotency_key=idempotency_key,
            comment=comment,
            meta=meta,
        )
        self.session.add(transaction)
        await self.session.flush()
        return transaction

    async def _consume_lots(self, *, user_id: int, points: int) -> None:
        remaining = points
        result = await self.session.execute(
            select(PointLot)
            .where(PointLot.user_id == user_id, PointLot.remaining_points > 0)
            .order_by(PointLot.expires_at.asc())
            .with_for_update()
        )
        for lot in result.scalars():
            if remaining <= 0:
                break
            used = min(lot.remaining_points, remaining)
            lot.remaining_points -= used
            remaining -= used


def generate_expiration_key(user_id: int, lot_ids: list[int]) -> str:
    lot_part = "-".join(str(lot_id) for lot_id in lot_ids)
    return f"expiration:{user_id}:{lot_part}"
