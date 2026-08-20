from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.roles import ADMIN_ROLES
from app.db.session import get_db
from app.models import AuditEvent, StudySite, User
from app.schemas.common import AuditEventOut, StudySiteCreate, StudySiteOut
from app.services.audit import write_audit


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
    return list(
        db.scalars(
            select(AuditEvent)
            .order_by(AuditEvent.created_at.desc())
            .limit(limit)
        )
    )
