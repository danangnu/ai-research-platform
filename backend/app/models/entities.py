from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    JSON,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    Column,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDPrimaryKeyMixin, TimestampMixin, utcnow


user_roles = Table(
    "user_roles",
    Base.metadata,
    Column(
        "user_id",
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "role_id",
        String(36),
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Role(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(255), default="", nullable=False)

    users: Mapped[list["User"]] = relationship(
        secondary=user_roles,
        back_populates="roles",
    )


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    roles: Mapped[list[Role]] = relationship(
        secondary=user_roles,
        back_populates="users",
        lazy="selectin",
    )


class Project(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="planning", nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class Milestone(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "milestones"
    __table_args__ = (
        UniqueConstraint("project_id", "code", name="uq_milestone_project_code"),
    )

    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="not_started", nullable=False)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class StudyTask(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "study_tasks"

    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    milestone_id: Mapped[str | None] = mapped_column(ForeignKey("milestones.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="not_started", nullable=False)
    priority: Mapped[str] = mapped_column(String(16), default="medium", nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class TaskUpdate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "task_updates"

    task_id: Mapped[str] = mapped_column(ForeignKey("study_tasks.id", ondelete="CASCADE"), nullable=False)
    author_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    status_snapshot: Mapped[str] = mapped_column(String(32), nullable=False)


class Risk(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "risks"

    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    level: Mapped[str] = mapped_column(String(16), default="medium", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="open", nullable=False)
    mitigation: Mapped[str] = mapped_column(Text, default="", nullable=False)
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class StudySite(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "study_sites"

    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)


class RecruitmentApplication(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "recruitment_applications"

    reference_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    site_id: Mapped[str | None] = mapped_column(ForeignKey("study_sites.id", ondelete="SET NULL"), nullable=True, index=True)
    preferred_name: Mapped[str] = mapped_column(String(120), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    recruitment_source: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    consent_to_screen: Mapped[bool] = mapped_column(Boolean, nullable=False)
    privacy_acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False)
    consent_version: Mapped[str] = mapped_column(String(64), nullable=False)
    screening_answers: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="submitted", nullable=False, index=True)
    review_note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    reviewed_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SelectionDecision(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "selection_decisions"

    application_id: Mapped[str] = mapped_column(
        ForeignKey("recruitment_applications.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    decided_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class ParticipantCounter(Base):
    __tablename__ = "participant_counters"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    next_value: Mapped[int] = mapped_column(Integer, nullable=False)


class Participant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "participants"

    participant_code: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )
    application_id: Mapped[str] = mapped_column(
        ForeignKey("recruitment_applications.id", ondelete="RESTRICT"),
        unique=True,
        nullable=False,
        index=True,
    )
    site_id: Mapped[str | None] = mapped_column(
        ForeignKey("study_sites.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), unique=True, nullable=True
    )
    lifecycle_status: Mapped[str] = mapped_column(
        String(32), default="enrolled", nullable=False, index=True
    )
    allocation_status: Mapped[str] = mapped_column(
        String(32), default="not_allocated", nullable=False, index=True
    )
    study_group: Mapped[str | None] = mapped_column(String(32), nullable=True)
    enrolled_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )


class AllocationState(Base):
    __tablename__ = "allocation_states"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    algorithm_version: Mapped[str] = mapped_column(
        String(64), default="balanced_random_v1", nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, onupdate=utcnow
    )


class ParticipantAllocation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "participant_allocations"

    participant_id: Mapped[str] = mapped_column(
        ForeignKey("participants.id", ondelete="RESTRICT"),
        unique=True,
        nullable=False,
        index=True,
    )
    study_group: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    method: Mapped[str] = mapped_column(
        String(64), default="balanced_random", nullable=False
    )
    algorithm_version: Mapped[str] = mapped_column(
        String(64), default="balanced_random_v1", nullable=False
    )
    allocation_basis: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    allocated_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    allocated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )


class StudyProtocol(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "study_protocols"
    __table_args__ = (
        UniqueConstraint("project_id", "version", name="uq_study_protocol_project_version"),
    )

    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="draft", nullable=False, index=True
    )
    objective: Mapped[str] = mapped_column(Text, default="", nullable=False)
    randomization_unit: Mapped[str] = mapped_column(
        String(64), default="participant", nullable=False
    )
    allocation_method: Mapped[str] = mapped_column(
        String(64), default="stratified_permuted_block", nullable=False
    )
    target_total: Mapped[int] = mapped_column(Integer, default=600, nullable=False)
    conditions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    stratification_factors: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    task_blocks: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    permitted_block_sizes: Mapped[list[int]] = mapped_column(
        JSON, default=list, nullable=False
    )
    protocol_document_ref: Mapped[str] = mapped_column(Text, default="", nullable=False)
    change_summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    supersedes_protocol_id: Mapped[str | None] = mapped_column(
        ForeignKey("study_protocols.id", ondelete="SET NULL"), nullable=True
    )
    configuration_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class AuditEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "audit_events"

    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
