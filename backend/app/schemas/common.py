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
