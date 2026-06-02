"""add web pwa schema

Revision ID: 20260602_0003
Revises: 20260529_0002
Create Date: 2026-06-02 19:20:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260602_0003"
down_revision: str | None = "20260529_0002"
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
    op.add_column("users", sa.Column("phone_normalized", sa.String(length=32), nullable=True))
    op.create_index("ix_users_phone_normalized", "users", ["phone_normalized"], unique=True)
    op.alter_column("users", "telegram_id", existing_type=sa.BigInteger(), nullable=True)

    op.add_column("sellers", sa.Column("phone", sa.String(length=32), nullable=True))
    op.add_column("sellers", sa.Column("phone_normalized", sa.String(length=32), nullable=True))
    op.add_column("sellers", sa.Column("password_hash", sa.String(length=255), nullable=True))
    op.create_index("ix_sellers_phone_normalized", "sellers", ["phone_normalized"], unique=True)
    op.alter_column("sellers", "telegram_id", existing_type=sa.BigInteger(), nullable=True)

    op.add_column(
        "loyalty_settings",
        sa.Column(
            "welcome_bonus_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "loyalty_settings",
        sa.Column("welcome_bonus_points", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "consents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("version", sa.String(length=32), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        *timestamps(),
    )
    op.create_index("ix_consents_user_id", "consents", ["user_id"])

    op.create_table(
        "special_offers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("image_path", sa.String(length=512), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        *timestamps(),
    )

    op.create_table(
        "offer_dismissals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("offer_id", sa.Integer(), sa.ForeignKey("special_offers.id"), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("user_id", "offer_id", name="uq_offer_dismissals_user_offer"),
    )
    op.create_index("ix_offer_dismissals_user_id", "offer_dismissals", ["user_id"])
    op.create_index("ix_offer_dismissals_offer_id", "offer_dismissals", ["offer_id"])


def downgrade() -> None:
    op.drop_index("ix_offer_dismissals_offer_id", table_name="offer_dismissals")
    op.drop_index("ix_offer_dismissals_user_id", table_name="offer_dismissals")
    op.drop_table("offer_dismissals")
    op.drop_table("special_offers")
    op.drop_index("ix_consents_user_id", table_name="consents")
    op.drop_table("consents")
    op.drop_column("loyalty_settings", "welcome_bonus_points")
    op.drop_column("loyalty_settings", "welcome_bonus_enabled")
    op.alter_column("sellers", "telegram_id", existing_type=sa.BigInteger(), nullable=False)
    op.drop_index("ix_sellers_phone_normalized", table_name="sellers")
    op.drop_column("sellers", "password_hash")
    op.drop_column("sellers", "phone_normalized")
    op.drop_column("sellers", "phone")
    op.alter_column("users", "telegram_id", existing_type=sa.BigInteger(), nullable=False)
    op.drop_index("ix_users_phone_normalized", table_name="users")
    op.drop_column("users", "phone_normalized")
