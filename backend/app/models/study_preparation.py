"""Version-pinned preparation records; independent of the original demo."""

from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, UUIDPrimaryKeyMixin, utcnow


class PreparedConfiguration(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "prepared_configurations"
    version: Mapped[str] = mapped_column(String(64), unique=True)
    definition: Mapped[dict] = mapped_column(JSON)
    definition_hash: Mapped[str] = mapped_column(String(64))
    created_by_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class PreparedRun(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "prepared_runs"
    participant_id: Mapped[str] = mapped_column(
        ForeignKey("participants.id", ondelete="RESTRICT"), unique=True
    )
    configuration_id: Mapped[str] = mapped_column(
        ForeignKey("prepared_configurations.id", ondelete="RESTRICT")
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class PreparedObservation(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "prepared_observations"
    __table_args__ = (
        UniqueConstraint("run_id", "stage", name="uq_prepared_run_stage"),
    )
    run_id: Mapped[str] = mapped_column(
        ForeignKey("prepared_runs.id", ondelete="RESTRICT"), index=True
    )
    stage: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)
    score: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    recorded_by_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
