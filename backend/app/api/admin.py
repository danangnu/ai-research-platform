from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.roles import ADMIN_ROLES, PROJECT_ADMIN
from app.db.session import get_db
from app.models import AuditEvent, StudySite, User
from app.schemas.common import AuditEventOut, StudySiteCreate, StudySiteOut
from app.services.audit import write_audit
from app.services.privacy import safe_audit


router = APIRouter(prefix="/api/admin", tags=["administration"])


@router.get("/study-sites", response_model=list[StudySiteOut])
def list_sites(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*ADMIN_ROLES)),
):
    return list(db.scalars(select(StudySite).order_by(StudySite.name)))


@router.post("/study-sites", response_model=StudySiteOut, status_code=201)
def create_site(
    payload: StudySiteCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*ADMIN_ROLES)),
):
    site = StudySite(**payload.model_dump())
    db.add(site)

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Study-site code already exists.") from exc

    write_audit(
        db,
        actor=user,
        action="study_site.created",
        entity_type="study_site",
        entity_id=site.id,
        details={"code": site.code, "name": site.name},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(site)
    return site


@router.get("/audit", response_model=list[AuditEventOut])
def audit_events(
    limit: int = 200,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*ADMIN_ROLES)),
):
    limit = max(1, min(limit, 1000))
    return [safe_audit(event) for event in db.scalars(
            select(AuditEvent)
            .order_by(AuditEvent.created_at.desc())
            .limit(limit)
        )]


from pydantic import BaseModel, Field, ConfigDict
from app.core.config import settings
from app.models import Participant, RecruitmentApplication


class IdentityRevealIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    participant_codes: list[str] = Field(min_length=1, max_length=600)
    reason: str = Field(min_length=8, max_length=500)
    confirmed: bool = False


@router.post("/identity-reveal")
def reveal_identity(payload: IdentityRevealIn, request: Request,
                    db: Session = Depends(get_db),
                    user: User = Depends(require_roles(PROJECT_ADMIN))):
    if user.email.lower() != settings.admin_email.lower():
        raise HTTPException(403, "Only the designated identity administrator can run this report.")
    if not payload.confirmed or len(payload.reason.strip()) < 8:
        raise HTTPException(422, "Confirm the reveal and provide its purpose.")
    codes = sorted(set(code.strip() for code in payload.participant_codes))
    rows = db.execute(select(Participant, RecruitmentApplication).join(
        RecruitmentApplication, Participant.application_id == RecruitmentApplication.id
    ).where(Participant.participant_code.in_(codes))).all()
    if len(rows) != len(codes):
        raise HTTPException(404, "One or more participant numbers were not found.")
    event = write_audit(db, actor=user, action="identity.reveal_report",
        entity_type="identity_report", entity_id=None,
        details={"participant_codes": codes, "row_count": len(rows), "reason": payload.reason.strip()},
        ip_address=request.client.host if request.client else None)
    # Commit the audit before releasing any identities. A failed commit reveals nothing.
    db.commit()
    return {"restricted": True, "row_count": len(rows),
            "rows": [{"participant_code": p.participant_code,
                      "name": a.preferred_name, "email": a.contact_email} for p, a in rows]}
