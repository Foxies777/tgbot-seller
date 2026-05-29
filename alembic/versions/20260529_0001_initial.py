"""initial schema

Revision ID: 20260529_0001
Revises:
Create Date: 2026-05-29 14:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260529_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("balance_points", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        *timestamps(),
    )
    op.create_index("ix_users_telegram_id", "users", ["telegram_id"], unique=True)

    op.create_table(
        "sellers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="seller"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *timestamps(),
    )
    op.create_index("ix_sellers_telegram_id", "sellers", ["telegram_id"], unique=True)

    op.create_table(
        "loyalty_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("earn_percent", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("max_redeem_percent", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("point_ttl_days", sa.Integer(), nullable=False, server_default="365"),
        sa.Column("redeem_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        *timestamps(),
    )

    op.create_table(
        "holiday_bonuses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("earn_percent", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *timestamps(),
    )

    op.create_table(
        "promo_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        *timestamps(),
    )
    op.create_index("ix_promo_codes_code", "promo_codes", ["code"], unique=True)

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("seller_id", sa.Integer(), sa.ForeignKey("sellers.id"), nullable=True),
        sa.Column("transaction_type", sa.String(length=32), nullable=False),
        sa.Column("purchase_amount_minor", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("points_delta", sa.Integer(), nullable=False),
        sa.Column("balance_before", sa.Integer(), nullable=False),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        *timestamps(),
        sa.UniqueConstraint("idempotency_key", name="uq_transactions_idempotency_key"),
    )
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"])
    op.create_index("ix_transactions_seller_id", "transactions", ["seller_id"])
    op.create_index("ix_transactions_transaction_type", "transactions", ["transaction_type"])

    op.create_table(
        "point_lots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("transactions.id"), nullable=False),
        sa.Column("original_points", sa.Integer(), nullable=False),
        sa.Column("remaining_points", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_point_lots_user_id", "point_lots", ["user_id"])
    op.create_index("ix_point_lots_transaction_id", "point_lots", ["transaction_id"])
    op.create_index("ix_point_lots_expires_at", "point_lots", ["expires_at"])

    op.create_table(
        "idempotency_keys",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("transactions.id"), nullable=True),
        *timestamps(),
    )
    op.create_index("ix_idempotency_keys_key", "idempotency_keys", ["key"], unique=True)

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_type", sa.String(length=32), nullable=False),
        sa.Column("actor_id", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=True),
        sa.Column("old_value", sa.JSON(), nullable=True),
        sa.Column("new_value", sa.JSON(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        *timestamps(),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_index("ix_idempotency_keys_key", table_name="idempotency_keys")
    op.drop_table("idempotency_keys")
    op.drop_index("ix_point_lots_expires_at", table_name="point_lots")
    op.drop_index("ix_point_lots_transaction_id", table_name="point_lots")
    op.drop_index("ix_point_lots_user_id", table_name="point_lots")
    op.drop_table("point_lots")
    op.drop_index("ix_transactions_transaction_type", table_name="transactions")
    op.drop_index("ix_transactions_seller_id", table_name="transactions")
    op.drop_index("ix_transactions_user_id", table_name="transactions")
    op.drop_table("transactions")
    op.drop_index("ix_promo_codes_code", table_name="promo_codes")
    op.drop_table("promo_codes")
    op.drop_table("holiday_bonuses")
    op.drop_table("loyalty_settings")
    op.drop_index("ix_sellers_telegram_id", table_name="sellers")
    op.drop_table("sellers")
    op.drop_index("ix_users_telegram_id", table_name="users")
    op.drop_table("users")
