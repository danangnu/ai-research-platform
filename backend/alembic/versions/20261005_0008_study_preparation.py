"""Add versioned study preparation without altering legacy observations."""

from alembic import op
import sqlalchemy as sa

revision = "20261005_0008"
down_revision = "20261002_0007"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "prepared_configurations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("version", sa.String(64), nullable=False, unique=True),
        sa.Column("definition", sa.JSON(), nullable=False),
        sa.Column("definition_hash", sa.String(64), nullable=False),
        sa.Column(
            "created_by_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "prepared_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "participant_id",
            sa.String(36),
            sa.ForeignKey("participants.id", ondelete="RESTRICT"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "configuration_id",
            sa.String(36),
            sa.ForeignKey("prepared_configurations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "prepared_observations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "run_id",
            sa.String(36),
            sa.ForeignKey("prepared_runs.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("stage", sa.String(64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("score", sa.JSON(), nullable=True),
        sa.Column(
            "recorded_by_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("run_id", "stage", name="uq_prepared_run_stage"),
    )
    op.create_index(
        "ix_prepared_observations_run_id", "prepared_observations", ["run_id"]
    )


def downgrade():
    op.drop_table("prepared_observations")
    op.drop_table("prepared_runs")
    op.drop_table("prepared_configurations")
