from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=512)


class UserOut(ORMModel):
    id: str
    email: EmailStr
    full_name: str
    is_active: bool
    roles: list[str]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProjectCreate(BaseModel):
    code: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=255)
    description: str = Field(default="", max_length=5000)
    status: str = Field(default="planning", max_length=32)
    start_date: date | None = None
    target_end_date: date | None = None
    owner_id: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    status: str | None = Field(default=None, max_length=32)
    start_date: date | None = None
    target_end_date: date | None = None
    owner_id: str | None = None


class ProjectOut(ORMModel):
    id: str
    code: str
    name: str
    description: str
    status: str
    start_date: date | None
    target_end_date: date | None
    owner_id: str | None
    created_at: datetime
    updated_at: datetime


class MilestoneCreate(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=2, max_length=255)
    description: str = Field(default="", max_length=5000)
    status: str = Field(default="not_started", max_length=32)
    start_date: date | None = None
    due_date: date | None = None


class MilestoneOut(ORMModel):
    id: str
    project_id: str
    code: str
    name: str
    description: str
    status: str
    start_date: date | None
    due_date: date | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TaskCreate(BaseModel):
    milestone_id: str | None = None
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(default="", max_length=5000)
    status: str = Field(default="not_started", max_length=32)
    priority: str = Field(default="medium", max_length=16)
    owner_id: str | None = None
    due_date: date | None = None


class TaskUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    status: str | None = Field(default=None, max_length=32)
    priority: str | None = Field(default=None, max_length=16)
    owner_id: str | None = None
    due_date: date | None = None
    note: str | None = Field(default=None, max_length=5000)


class TaskOut(ORMModel):
    id: str
    project_id: str
    milestone_id: str | None
    title: str
    description: str
    status: str
    priority: str
    owner_id: str | None
    due_date: date | None
    created_at: datetime
    updated_at: datetime


class RiskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(default="", max_length=5000)
    level: str = Field(default="medium", max_length=16)
    status: str = Field(default="open", max_length=32)
    mitigation: str = Field(default="", max_length=5000)
    owner_id: str | None = None


class RiskOut(ORMModel):
    id: str
    project_id: str
    title: str
    description: str
    level: str
    status: str
    mitigation: str
    owner_id: str | None
    created_at: datetime
    updated_at: datetime


class StudySiteCreate(BaseModel):
    code: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=255)
    status: str = Field(default="active", max_length=32)


class StudySiteOut(ORMModel):
    id: str
    code: str
    name: str
    status: str
    created_at: datetime
    updated_at: datetime


class AuditEventOut(ORMModel):
    id: str
    actor_user_id: str | None
    action: str
    entity_type: str
    entity_id: str | None
    details: dict[str, Any]
    ip_address: str | None
    created_at: datetime


class RecruitmentSiteOut(ORMModel):
    id: str
    code: str
    name: str


class RecruitmentPublicInfoOut(BaseModel):
    study_name: str
    recruitment_open: bool
    target_total: int
    target_groups: dict[str, int]
    consent_version: str
    protocol_criteria_configured: bool
    demo_mode: bool
    sites: list[RecruitmentSiteOut]


class RecruitmentApplicationCreate(BaseModel):
    preferred_name: str = Field(min_length=2, max_length=120)
    contact_email: EmailStr
    site_id: str | None = None
    recruitment_source: str = Field(default="", max_length=120)
    consent_to_screen: bool
    privacy_acknowledged: bool
    screening_answers: dict[str, bool] = Field(default_factory=dict)


class RecruitmentApplicationOut(ORMModel):
    id: str
    reference_code: str
    site_id: str | None
    preferred_name: str
    contact_email: EmailStr
    recruitment_source: str
    consent_to_screen: bool
    privacy_acknowledged: bool
    consent_version: str
    screening_answers: dict[str, Any]
    status: str
    review_note: str
    reviewed_by_id: str | None
    submitted_at: datetime
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class RecruitmentApplicationReview(BaseModel):
    status: str = Field(min_length=2, max_length=32)
    review_note: str = Field(default="", max_length=2000)


class RecruitmentMetricsOut(BaseModel):
    applications: int
    submitted: int
    under_review: int
    needs_review: int
    eligible: int
    ineligible: int


class SelectionDecisionCreate(BaseModel):
    status: str = Field(min_length=2, max_length=32)
    note: str = Field(default="", max_length=2000)


class SelectionDecisionOut(ORMModel):
    id: str
    application_id: str
    status: str
    note: str
    decided_by_id: str | None
    decided_at: datetime
    created_at: datetime
    updated_at: datetime


class ParticipantOut(ORMModel):
    id: str
    participant_code: str
    application_id: str
    site_id: str | None
    user_id: str | None
    lifecycle_status: str
    allocation_status: str
    study_group: str | None
    enrolled_by_id: str | None
    enrolled_at: datetime
    created_at: datetime
    updated_at: datetime


class ParticipantAllocationOut(ORMModel):
    id: str
    participant_id: str
    study_group: str
    method: str
    algorithm_version: str
    allocation_basis: dict[str, Any]
    allocated_by_id: str | None
    allocated_at: datetime
    created_at: datetime
    updated_at: datetime


class AllocationSummaryOut(BaseModel):
    target_total: int
    target_per_group: int
    allocated: int
    not_allocated: int
    remaining_capacity: int
    groups: dict[str, int]
    algorithm_version: str
    method: str
    protocol_finalized: bool


class ParticipantMetricsOut(BaseModel):
    participants: int
    enrolled: int
    allocated: int
    not_allocated: int
    remaining_target: int
    humorbot: int = 0
    starcasm: int = 0
    control: int = 0


class ParticipantAccountLinkIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    initial_password: str | None = Field(default=None, min_length=12, max_length=512)


class ParticipantAccountLinkOut(BaseModel):
    participant_id: str
    participant_code: str
    user_id: str
    account_status: str
    created_account: bool
    linked_at: datetime


class ParticipantSelfOut(BaseModel):
    participant_id: str
    participant_code: str
    site_id: str | None
    lifecycle_status: str
    allocation_status: str
    assigned_condition: str | None
    enrolled_at: datetime
    account_status: str
