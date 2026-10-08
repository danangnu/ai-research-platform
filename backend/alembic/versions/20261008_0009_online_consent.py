"""Add versioned demonstration consent; never backfill acceptance."""
from alembic import op
import sqlalchemy as sa

revision = "20261008_0009"
down_revision = "20261005_0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("consent_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("application_id", sa.String(36), sa.ForeignKey("recruitment_applications.id", ondelete="RESTRICT"), nullable=False, unique=True),
        sa.Column("version", sa.String(80), nullable=False),
        sa.Column("text_sha256", sa.String(64), nullable=False),
        sa.Column("text_snapshot", sa.Text(), nullable=False),
        sa.Column("synthetic_only", sa.Boolean(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("consent_records")
