"""add customer password and access code

Revision ID: 20260602_0004
Revises: 20260602_0003
Create Date: 2026-06-02 22:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260602_0004"
down_revision: str | None = "20260602_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("access_code_hash", sa.String(length=64), nullable=True))
    op.create_index("ix_users_access_code_hash", "users", ["access_code_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_access_code_hash", table_name="users")
    op.drop_column("users", "access_code_hash")
    op.drop_column("users", "password_hash")
