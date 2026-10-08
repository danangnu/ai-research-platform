from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer, computed_field


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
    study_duration_days: int = 30
    clinic_count: int = 3
    informed_consent: dict[str, Any]


class RecruitmentApplicationCreate(BaseModel):
    preferred_name: str = Field(min_length=2, max_length=120)
    contact_email: EmailStr
    site_id: str | None = None
    recruitment_source: str = Field(default="", max_length=120)
    consent_to_screen: bool
    privacy_acknowledged: bool
    screening_answers: dict[str, bool] = Field(default_factory=dict)
    informed_consent_accepted: bool = False
    informed_consent_version: str = ""


class RecruitmentApplicationOut(ORMModel):
    id: str
    reference_code: str
    site_id: str | None
    preferred_name: str
    contact_email: str
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


    @field_serializer("screening_answers")
    def safe_answers(self, value):
        allowed = {"demo_online_access", "demo_instruction_language", "demo_schedule_availability"}
        return {k: v for k, v in value.items() if k in allowed and isinstance(v, bool)}

    enrolled: bool = False

    @field_serializer("preferred_name", "contact_email", "recruitment_source", "review_note")
    def hide_identity(self, value):
        return "Restricted"


class RecruitmentReceiptOut(RecruitmentApplicationOut):
    # Returned once at submission; never included in staff responses or audit.
    access_token: str


class RecruitmentAccessIn(BaseModel):
    reference_code: str = Field(min_length=5, max_length=32)
    access_token: str = Field(min_length=32, max_length=128)


class RecruitmentStatusOut(BaseModel):
    reference_code: str
    status: str
    stage: str
    submitted_at: datetime
    updated_at: datetime
    next_step: str
    can_withdraw: bool


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
    withdrawn: int = 0


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


    @field_serializer("note")
    def hide_legacy_note(self, value):
        return ""


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


    @field_serializer("application_id", "user_id")
    def hide_identity_join(self, value):
        return None

    @computed_field
    @property
    def account_linked(self) -> bool:
        return bool(self.user_id)


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
    linked_accounts: int
    remaining_target: int
    humorbot: int = 0
    starcasm: int = 0
    control: int = 0


class ParticipantAccountLinkIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    initial_password: str | None = Field(default=None, min_length=12, max_length=512)


class ParticipantAccountLinkOut(BaseModel):
    participant_id: str
    participant_code: str
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


class ParticipantAuditEventOut(ORMModel):
    id: str
    actor_user_id: str | None
    action: str
    entity_type: str
    entity_id: str | None
    details: dict[str, Any]
    created_at: datetime


class ParticipantAuditTrailOut(BaseModel):
    participant_id: str
    participant_code: str
    application_id: None = None
    events: list[ParticipantAuditEventOut]


class ProtocolCondition(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    label: str = Field(min_length=2, max_length=120)
    target_n: int = Field(ge=1, le=100000)


class ProtocolStratumLevel(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=120)


class ProtocolStratificationFactor(BaseModel):
    key: str = Field(min_length=2, max_length=64)
    label: str = Field(min_length=2, max_length=120)
    source_field: str = Field(min_length=2, max_length=120)
    required: bool = True
    levels: list[ProtocolStratumLevel] = Field(default_factory=list, max_length=24)


class ProtocolTaskBlock(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=2, max_length=160)


class StudyProtocolCreate(BaseModel):
    project_id: str
    version: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=3, max_length=255)
    objective: str = Field(default="", max_length=5000)
    randomization_unit: str = Field(default="participant", min_length=2, max_length=64)
    allocation_method: str = Field(
        default="stratified_permuted_block", min_length=2, max_length=64
    )
    target_total: int = Field(default=600, ge=1, le=100000)
    conditions: list[ProtocolCondition] = Field(default_factory=list, max_length=20)
    stratification_factors: list[ProtocolStratificationFactor] = Field(
        default_factory=list, max_length=10
    )
    task_blocks: list[ProtocolTaskBlock] = Field(default_factory=list, max_length=24)
    permitted_block_sizes: list[int] = Field(default_factory=list, max_length=20)
    protocol_document_ref: str = Field(default="", max_length=2000)
    change_summary: str = Field(default="", max_length=5000)
    supersedes_protocol_id: str | None = None


class StudyProtocolUpdate(BaseModel):
    version: str | None = Field(default=None, min_length=1, max_length=64)
    title: str | None = Field(default=None, min_length=3, max_length=255)
    objective: str | None = Field(default=None, max_length=5000)
    randomization_unit: str | None = Field(default=None, min_length=2, max_length=64)
    allocation_method: str | None = Field(default=None, min_length=2, max_length=64)
    target_total: int | None = Field(default=None, ge=1, le=100000)
    conditions: list[ProtocolCondition] | None = Field(default=None, max_length=20)
    stratification_factors: list[ProtocolStratificationFactor] | None = Field(
        default=None, max_length=10
    )
    task_blocks: list[ProtocolTaskBlock] | None = Field(default=None, max_length=24)
    permitted_block_sizes: list[int] | None = Field(default=None, max_length=20)
    protocol_document_ref: str | None = Field(default=None, max_length=2000)
    change_summary: str | None = Field(default=None, max_length=5000)
    supersedes_protocol_id: str | None = None


class StudyProtocolOut(ORMModel):
    id: str
    project_id: str
    version: str
    title: str
    status: str
    objective: str
    randomization_unit: str
    allocation_method: str
    target_total: int
    conditions: list[dict[str, Any]]
    stratification_factors: list[dict[str, Any]]
    task_blocks: list[dict[str, Any]]
    permitted_block_sizes: list[int]
    protocol_document_ref: str
    change_summary: str
    supersedes_protocol_id: str | None
    configuration_hash: str | None
    created_by_id: str | None
    approved_by_id: str | None
    approved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProtocolValidationOut(BaseModel):
    protocol_id: str
    valid: bool
    approval_ready: bool
    activation_ready: bool = False
    errors: list[str]
    warnings: list[str]
    configuration_hash: str
    activation_blocker: str


class ProtocolSummaryOut(BaseModel):
    total_versions: int
    drafts: int
    approved: int
    active: int
    latest_protocol_id: str | None
    allocation_engine_connected: bool = False

