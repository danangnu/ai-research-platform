"""Add prototype assessment and session records without changing existing data."""
from alembic import op
import sqlalchemy as sa
revision = "20261002_0007"
down_revision = "20260928_0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("study_observations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("participant_id", sa.String(36), sa.ForeignKey("participants.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("stage", sa.String(20), nullable=False),
        sa.Column("instrument_version", sa.String(64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("recorded_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("participant_id", "stage", name="uq_study_observation_stage"))
    op.create_index("ix_study_observations_participant_id", "study_observations", ["participant_id"])


def downgrade():
    op.drop_table("study_observations")
