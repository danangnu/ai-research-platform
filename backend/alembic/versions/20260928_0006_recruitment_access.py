"""Private applicant status access for the recruitment demo.

Existing applications keep a null hash and remain staff-accessible only.
"""
from alembic import op
import sqlalchemy as sa

revision = "20260928_0006"
down_revision = "20260821_0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("recruitment_applications", sa.Column("access_token_hash", sa.String(64), nullable=True))


def downgrade():
    op.drop_column("recruitment_applications", "access_token_hash")
