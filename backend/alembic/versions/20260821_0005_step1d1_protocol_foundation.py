"""Step 1D.1 protocol and stratification foundation

Revision ID: 20260821_0005
Revises: 20260821_0004
Create Date: 2026-08-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20260821_0005"
down_revision = "20260821_0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "study_protocols",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.String(64), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("objective", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "randomization_unit",
            sa.String(64),
            nullable=False,
            server_default="participant",
        ),
        sa.Column(
            "allocation_method",
            sa.String(64),
            nullable=False,
            server_default="stratified_permuted_block",
        ),
        sa.Column("target_total", sa.Integer(), nullable=False, server_default="600"),
        sa.Column("conditions", sa.JSON(), nullable=False),
        sa.Column("stratification_factors", sa.JSON(), nullable=False),
        sa.Column("task_blocks", sa.JSON(), nullable=False),
        sa.Column("permitted_block_sizes", sa.JSON(), nullable=False),
        sa.Column("protocol_document_ref", sa.Text(), nullable=False, server_default=""),
        sa.Column("change_summary", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "supersedes_protocol_id",
            sa.String(36),
            sa.ForeignKey("study_protocols.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("configuration_hash", sa.String(64), nullable=True),
        sa.Column(
            "created_by_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "approved_by_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "project_id", "version", name="uq_study_protocol_project_version"
        ),
    )
    op.create_index("ix_study_protocols_project_id", "study_protocols", ["project_id"])
    op.create_index("ix_study_protocols_status", "study_protocols", ["status"])


def downgrade():
    op.drop_table("study_protocols")
