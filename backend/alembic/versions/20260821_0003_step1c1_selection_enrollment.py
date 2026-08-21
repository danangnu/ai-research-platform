"""Step 1C.1 selection and enrollment foundation

Revision ID: 20260821_0003
Revises: 20260821_0002
Create Date: 2026-08-21
"""
from alembic import op
import sqlalchemy as sa

revision = "20260821_0003"
down_revision = "20260821_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "selection_decisions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("application_id", sa.String(36), sa.ForeignKey("recruitment_applications.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("decided_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_selection_decisions_application_id", "selection_decisions", ["application_id"], unique=True)
    op.create_index("ix_selection_decisions_status", "selection_decisions", ["status"])

    op.create_table(
        "participant_counters",
        sa.Column("key", sa.String(32), primary_key=True),
        sa.Column("next_value", sa.Integer(), nullable=False),
    )
    op.bulk_insert(
        sa.table("participant_counters", sa.column("key", sa.String), sa.column("next_value", sa.Integer)),
        [{"key": "participant", "next_value": 1}],
    )

    op.create_table(
        "participants",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("participant_code", sa.String(32), nullable=False, unique=True),
        sa.Column("application_id", sa.String(36), sa.ForeignKey("recruitment_applications.id", ondelete="RESTRICT"), nullable=False, unique=True),
        sa.Column("site_id", sa.String(36), sa.ForeignKey("study_sites.id", ondelete="SET NULL"), nullable=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, unique=True),
        sa.Column("lifecycle_status", sa.String(32), nullable=False, server_default="enrolled"),
        sa.Column("allocation_status", sa.String(32), nullable=False, server_default="not_allocated"),
        sa.Column("study_group", sa.String(32), nullable=True),
        sa.Column("enrolled_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_participants_participant_code", "participants", ["participant_code"], unique=True)
    op.create_index("ix_participants_application_id", "participants", ["application_id"], unique=True)
    op.create_index("ix_participants_site_id", "participants", ["site_id"])
    op.create_index("ix_participants_lifecycle_status", "participants", ["lifecycle_status"])
    op.create_index("ix_participants_allocation_status", "participants", ["allocation_status"])
    op.create_index("ix_participants_enrolled_at", "participants", ["enrolled_at"])


def downgrade():
    op.drop_table("participants")
    op.drop_table("participant_counters")
    op.drop_table("selection_decisions")
