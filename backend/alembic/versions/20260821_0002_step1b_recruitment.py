"""Step 1B recruitment intake and eligibility review

Revision ID: 20260821_0002
Revises: 20260817_0001
Create Date: 2026-08-21
"""
from alembic import op
import sqlalchemy as sa

revision = "20260821_0002"
down_revision = "20260817_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "recruitment_applications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("reference_code", sa.String(32), nullable=False, unique=True),
        sa.Column("site_id", sa.String(36), sa.ForeignKey("study_sites.id", ondelete="SET NULL"), nullable=True),
        sa.Column("preferred_name", sa.String(120), nullable=False),
        sa.Column("contact_email", sa.String(255), nullable=False),
        sa.Column("recruitment_source", sa.String(120), nullable=False, server_default=""),
        sa.Column("consent_to_screen", sa.Boolean(), nullable=False),
        sa.Column("privacy_acknowledged", sa.Boolean(), nullable=False),
        sa.Column("consent_version", sa.String(64), nullable=False),
        sa.Column("screening_answers", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="submitted"),
        sa.Column("review_note", sa.Text(), nullable=False, server_default=""),
        sa.Column("reviewed_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_recruitment_applications_reference_code", "recruitment_applications", ["reference_code"], unique=True)
    op.create_index("ix_recruitment_applications_site_id", "recruitment_applications", ["site_id"])
    op.create_index("ix_recruitment_applications_contact_email", "recruitment_applications", ["contact_email"])
    op.create_index("ix_recruitment_applications_status", "recruitment_applications", ["status"])
    op.create_index("ix_recruitment_applications_submitted_at", "recruitment_applications", ["submitted_at"])


def downgrade():
    op.drop_table("recruitment_applications")
