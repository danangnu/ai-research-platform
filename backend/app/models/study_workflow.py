"""Append-only prototype observations, separate from recruitment identity."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, UUIDPrimaryKeyMixin, utcnow


class StudyObservation(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "study_observations"
    __table_args__ = (UniqueConstraint("participant_id", "stage", name="uq_study_observation_stage"),)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id", ondelete="RESTRICT"), index=True)
    stage: Mapped[str] = mapped_column(String(20))
    instrument_version: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)
    recorded_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
