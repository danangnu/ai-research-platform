from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, UUIDPrimaryKeyMixin, utcnow


class ConsentRecord(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "consent_records"
    application_id: Mapped[str] = mapped_column(ForeignKey("recruitment_applications.id", ondelete="RESTRICT"), unique=True)
    version: Mapped[str] = mapped_column(String(80))
    text_sha256: Mapped[str] = mapped_column(String(64))
    text_snapshot: Mapped[str] = mapped_column(Text)
    synthetic_only: Mapped[bool] = mapped_column(Boolean, default=True)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
