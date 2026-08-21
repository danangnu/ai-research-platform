"""Step 1C.2 experimental allocation foundation

Revision ID: 20260821_0004
Revises: 20260821_0003
Create Date: 2026-08-21
"""
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "20260821_0004"
down_revision = "20260821_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "allocation_states",
        sa.Column("key", sa.String(32), primary_key=True),
        sa.Column("algorithm_version", sa.String(64), nullable=False, server_default="balanced_random_v1"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.bulk_insert(
        sa.table(
            "allocation_states",
            sa.column("key", sa.String),
            sa.column("algorithm_version", sa.String),
            sa.column("updated_at", sa.DateTime(timezone=True)),
        ),
        [{"key": "primary", "algorithm_version": "balanced_random_v1", "updated_at": datetime.now(timezone.utc)}],
    )

    op.create_table(
        "participant_allocations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("participant_id", sa.String(36), sa.ForeignKey("participants.id", ondelete="RESTRICT"), nullable=False, unique=True),
        sa.Column("study_group", sa.String(32), nullable=False),
        sa.Column("method", sa.String(64), nullable=False, server_default="balanced_random"),
        sa.Column("algorithm_version", sa.String(64), nullable=False, server_default="balanced_random_v1"),
        sa.Column("allocation_basis", sa.JSON(), nullable=False),
        sa.Column("allocated_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("allocated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_participant_allocations_participant_id", "participant_allocations", ["participant_id"], unique=True)
    op.create_index("ix_participant_allocations_study_group", "participant_allocations", ["study_group"])
    op.create_index("ix_participant_allocations_allocated_at", "participant_allocations", ["allocated_at"])


def downgrade():
    op.drop_table("participant_allocations")
    op.drop_table("allocation_states")
