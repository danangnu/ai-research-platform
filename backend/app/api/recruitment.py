from __future__ import annotations

import hashlib
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.config import settings
from app.core.roles import RECRUITMENT_ROLES
from app.db.base import utcnow
from app.db.session import get_db
from app.models import Participant, ParticipantCounter, RecruitmentApplication, SelectionDecision, StudySite, User
from app.schemas.common import (
    RecruitmentAccessIn,
    RecruitmentReceiptOut,
    RecruitmentStatusOut,
    RecruitmentApplicationCreate,
    RecruitmentApplicationOut,
    RecruitmentApplicationReview,
    RecruitmentMetricsOut,
    RecruitmentPublicInfoOut,
    RecruitmentSiteOut,
    ParticipantOut,
    SelectionDecisionCreate,
    SelectionDecisionOut,
)
from app.services.audit import write_audit


public_router = APIRouter(prefix="/api/public/recruitment", tags=["public recruitment"])
staff_router = APIRouter(prefix="/api/recruitment", tags=["recruitment"])

ALLOWED_SELECTION_STATUSES = {"selected", "waitlisted", "not_selected"}


ALLOWED_REVIEW_STATUSES = {
    "submitted",
    "under_review",
    "needs_review",
    "eligible",
    "ineligible",
}


def _new_reference() -> str:
    return f"APP-{secrets.token_hex(4).upper()}"


def _serialize(application: RecruitmentApplication) -> RecruitmentApplicationOut:
    return RecruitmentApplicationOut.model_validate(application)


@public_router.get("/info", response_model=RecruitmentPublicInfoOut)
def public_recruitment_info(db: Session = Depends(get_db)):
    sites = list(
        db.scalars(
            select(StudySite)
            .where(StudySite.status == "active")
            .order_by(StudySite.name)
        )
    )
    return RecruitmentPublicInfoOut(
        study_name="HumorBot and STARCASM Research Study",
        recruitment_open=settings.recruitment_open and settings.demo_mode,
        target_total=600,
        target_groups={"HumorBot": 200, "STARCASM": 200, "Control": 200},
        consent_version=settings.screening_consent_version,
        protocol_criteria_configured=False,
        demo_mode=settings.demo_mode,
        sites=[RecruitmentSiteOut.model_validate(site) for site in sites],
    )


@public_router.post("/applications", response_model=RecruitmentReceiptOut, status_code=201)
def submit_application(
    payload: RecruitmentApplicationCreate,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    if not settings.recruitment_open or not settings.demo_mode:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Recruitment intake is closed. This release supports synthetic demo intake only.",
        )

    if not payload.consent_to_screen or not payload.privacy_acknowledged:
        raise HTTPException(
            status_code=422,
            detail="Consent-to-screen and privacy acknowledgement are required.",
        )

    if payload.site_id:
        site = db.get(StudySite, payload.site_id)
        if site is None or site.status != "active":
            raise HTTPException(status_code=400, detail="Selected study site is not available.")

    if len(payload.preferred_name.strip()) < 2:
        raise HTTPException(status_code=422, detail="Enter an alias with at least two characters.")

    normalized_email = payload.contact_email.lower().strip()
    existing = db.scalar(
        select(RecruitmentApplication).where(
            RecruitmentApplication.contact_email == normalized_email,
            RecruitmentApplication.status != "withdrawn",
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="An active application already exists for this email address.",
        )

    access_token = secrets.token_urlsafe(32)
    application = RecruitmentApplication(
        access_token_hash=hashlib.sha256(access_token.encode()).hexdigest(),
        reference_code=_new_reference(),
        site_id=payload.site_id,
        preferred_name=payload.preferred_name.strip(),
        contact_email=normalized_email,
        recruitment_source=payload.recruitment_source.strip(),
        consent_to_screen=True,
        privacy_acknowledged=True,
        consent_version=settings.screening_consent_version,
        screening_answers=payload.screening_answers,
        status="submitted",
        submitted_at=utcnow(),
    )
    db.add(application)

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Duplicate recruitment application.") from exc

    # Public audit deliberately avoids storing contact details or questionnaire answers.
    write_audit(
        db,
        actor=None,
        action="recruitment.application_submitted",
        entity_type="recruitment_application",
        entity_id=application.id,
        details={
            "reference_code": application.reference_code,
            "site_id": application.site_id,
            "consent_version": application.consent_version,
        },
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(application)
    return RecruitmentReceiptOut(**_serialize(application).model_dump(), access_token=access_token)


@staff_router.get("/applications", response_model=list[RecruitmentApplicationOut])
def list_applications(
    application_status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*RECRUITMENT_ROLES)),
):
    statement = select(RecruitmentApplication).order_by(
        RecruitmentApplication.submitted_at.desc()
    )
    if application_status:
        if application_status not in ALLOWED_REVIEW_STATUSES | {"withdrawn"}:
            raise HTTPException(status_code=400, detail="Unknown recruitment status.")
        statement = statement.where(RecruitmentApplication.status == application_status)
    return list(db.scalars(statement))


@staff_router.get("/metrics", response_model=RecruitmentMetricsOut)
def recruitment_metrics(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*RECRUITMENT_ROLES)),
):
    rows = db.execute(
        select(RecruitmentApplication.status, func.count(RecruitmentApplication.id))
        .group_by(RecruitmentApplication.status)
    ).all()
    counts = {row[0]: int(row[1]) for row in rows}
    total = sum(counts.values())
    return RecruitmentMetricsOut(
        applications=total,
        submitted=counts.get("submitted", 0),
        under_review=counts.get("under_review", 0),
        # The dashboard's "Needs review" card represents the active review
        # queue, so it includes both applications currently under review and
        # applications explicitly flagged as needing further review.
        needs_review=(
            counts.get("under_review", 0) + counts.get("needs_review", 0)
        ),
        eligible=counts.get("eligible", 0),
        ineligible=counts.get("ineligible", 0),
        withdrawn=counts.get("withdrawn", 0),
    )


@staff_router.get("/applications/{application_id}", response_model=RecruitmentApplicationOut)
def get_application(
    application_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*RECRUITMENT_ROLES)),
):
    application = db.get(RecruitmentApplication, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Recruitment application not found.")
    return application


@staff_router.patch("/applications/{application_id}/review", response_model=RecruitmentApplicationOut)
def review_application(
    application_id: str,
    payload: RecruitmentApplicationReview,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*RECRUITMENT_ROLES)),
):
    if payload.status not in ALLOWED_REVIEW_STATUSES - {"submitted"}:
        raise HTTPException(status_code=422, detail="Invalid eligibility-review status.")

    application = db.scalar(select(RecruitmentApplication).where(RecruitmentApplication.id == application_id).with_for_update())
    if application is None:
        raise HTTPException(status_code=404, detail="Recruitment application not found.")

    enrolled_participant = db.scalar(
        select(Participant).where(Participant.application_id == application.id)
    )
    if enrolled_participant is not None and payload.status != "eligible":
        raise HTTPException(
            status_code=409,
            detail="Eligibility is locked after participant enrollment.",
        )

    if application.status == "withdrawn":
        raise HTTPException(status_code=409, detail="A withdrawn application cannot be reopened. Submit a new application.")

    previous_status = application.status
    application.status = payload.status
    application.review_note = payload.review_note.strip()
    application.reviewed_by_id = user.id
    application.reviewed_at = utcnow()

    write_audit(
        db,
        actor=user,
        action="recruitment.application_reviewed",
        entity_type="recruitment_application",
        entity_id=application.id,
        details={
            "reference_code": application.reference_code,
            "previous_status": previous_status,
            "new_status": application.status,
        },
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(application)
    return application


@staff_router.get("/selections", response_model=list[SelectionDecisionOut])
def list_selection_decisions(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*RECRUITMENT_ROLES)),
):
    return list(
        db.scalars(
            select(SelectionDecision).order_by(SelectionDecision.decided_at.desc())
        )
    )


@staff_router.post(
    "/applications/{application_id}/selection",
    response_model=SelectionDecisionOut,
)
def record_selection_decision(
    application_id: str,
    payload: SelectionDecisionCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*RECRUITMENT_ROLES)),
):
    if payload.status not in ALLOWED_SELECTION_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid participant-selection status.")

    application = db.scalar(
        select(RecruitmentApplication)
        .where(RecruitmentApplication.id == application_id)
        .with_for_update()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Recruitment application not found.")
    if application.status != "eligible":
        raise HTTPException(
            status_code=409,
            detail="Only an eligible application can enter participant selection.",
        )

    enrolled_participant = db.scalar(
        select(Participant).where(Participant.application_id == application.id)
    )
    if enrolled_participant is not None:
        raise HTTPException(
            status_code=409,
            detail="Selection is locked after participant enrollment.",
        )

    decision = db.scalar(
        select(SelectionDecision).where(SelectionDecision.application_id == application.id)
    )
    previous_status = decision.status if decision else None
    now = utcnow()

    if decision is None:
        decision = SelectionDecision(
            application_id=application.id,
            status=payload.status,
            note=payload.note.strip(),
            decided_by_id=user.id,
            decided_at=now,
        )
        db.add(decision)
    else:
        decision.status = payload.status
        decision.note = payload.note.strip()
        decision.decided_by_id = user.id
        decision.decided_at = now

    write_audit(
        db,
        actor=user,
        action="participant.selection_recorded",
        entity_type="recruitment_application",
        entity_id=application.id,
        details={
            "reference_code": application.reference_code,
            "previous_status": previous_status,
            "new_status": decision.status,
        },
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(decision)
    return decision


def _next_participant_code(db: Session) -> str:
    counter = db.scalar(
        select(ParticipantCounter)
        .where(ParticipantCounter.key == "participant")
        .with_for_update()
    )
    if counter is None:
        counter = ParticipantCounter(key="participant", next_value=2)
        db.add(counter)
        number = 1
    else:
        number = counter.next_value
        counter.next_value += 1
    return f"P-{number:06d}"


@staff_router.post(
    "/applications/{application_id}/enroll",
    response_model=ParticipantOut,
)
def enroll_selected_application(
    application_id: str,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*RECRUITMENT_ROLES)),
):
    application = db.scalar(
        select(RecruitmentApplication)
        .where(RecruitmentApplication.id == application_id)
        .with_for_update()
    )
    if application is None:
        raise HTTPException(status_code=404, detail="Recruitment application not found.")

    existing = db.scalar(
        select(Participant).where(Participant.application_id == application.id)
    )
    if existing is not None:
        # Idempotent retry: return the existing identity and do not write a
        # second enrollment audit event.
        return existing

    if application.status != "eligible":
        raise HTTPException(
            status_code=409,
            detail="Only an eligible application can be enrolled.",
        )

    decision = db.scalar(
        select(SelectionDecision).where(
            SelectionDecision.application_id == application.id
        )
    )
    if decision is None or decision.status != "selected":
        raise HTTPException(
            status_code=409,
            detail="The eligible application must be selected before enrollment.",
        )

    participant = Participant(
        participant_code=_next_participant_code(db),
        application_id=application.id,
        site_id=application.site_id,
        user_id=None,
        lifecycle_status="enrolled",
        allocation_status="not_allocated",
        study_group=None,
        enrolled_by_id=user.id,
        enrolled_at=utcnow(),
    )
    db.add(participant)
    try:
        db.flush()
    except IntegrityError as exc:
        # A concurrent retry can pass the initial existence check before the
        # first transaction commits. The database uniqueness constraint is the
        # final guard; after rollback, return the identity created by the winner.
        db.rollback()
        existing = db.scalar(
            select(Participant).where(Participant.application_id == application_id)
        )
        if existing is not None:
            return existing
        raise HTTPException(
            status_code=409, detail="Participant enrollment conflicted with an existing record."
        ) from exc

    write_audit(
        db,
        actor=user,
        action="participant.enrolled",
        entity_type="participant",
        entity_id=participant.id,
        details={
            "participant_code": participant.participant_code,
            "application_id": application.id,
            "reference_code": application.reference_code,
            "site_id": application.site_id,
            "allocation_status": "not_allocated",
        },
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(participant)
    response.status_code = status.HTTP_201_CREATED
    return participant



def _application_access(payload: RecruitmentAccessIn, db: Session, *, lock: bool = False):
    statement = select(RecruitmentApplication).where(
        RecruitmentApplication.reference_code == payload.reference_code.strip().upper()
    )
    if lock:
        statement = statement.with_for_update()
    application = db.scalar(statement)
    expected = application.access_token_hash if application else None
    provided = hashlib.sha256(payload.access_token.encode()).hexdigest()
    if not secrets.compare_digest(provided, expected or "0" * 64):
        # Same response for missing references, wrong tokens and legacy records.
        raise HTTPException(status_code=404, detail="Reference or access key not recognised.")
    return application


def _public_status(application: RecruitmentApplication, db: Session):
    participant = db.scalar(select(Participant).where(Participant.application_id == application.id))
    selection = db.scalar(select(SelectionDecision).where(SelectionDecision.application_id == application.id))
    stage = application.status
    if application.status != "withdrawn":
        if participant:
            stage = "account_linked" if participant.user_id else "enrolled"
        elif selection and application.status == "eligible":
            stage = selection.status
    messages = {
        "submitted": "Application received. A staff review is the next step; no email has been sent by this demo.",
        "under_review": "Staff are reviewing the screening answers.",
        "needs_review": "Further staff review is needed. Check with the demo coordinator.",
        "eligible": "Screening review is complete. Selection has not yet been recorded.",
        "ineligible": "The screening decision is ineligible. The demo coordinator can explain the decision.",
        "selected": "Selected for demo enrollment. Staff will create a participant record separately.",
        "waitlisted": "On the demo waiting list. Enrollment is not guaranteed.",
        "not_selected": "Not selected for demo enrollment. Contact the demo coordinator with questions.",
        "enrolled": "A participant record has been created. Staff still need to arrange login access.",
        "account_linked": "Login access has been linked. Use the credentials supplied separately by the demo coordinator.",
        "withdrawn": "This application has been withdrawn. The workflow record is retained; withdrawal is not deletion.",
    }
    return RecruitmentStatusOut(
        reference_code=application.reference_code, status=application.status, stage=stage,
        submitted_at=application.submitted_at, updated_at=application.updated_at,
        next_step=messages.get(stage, "Contact the demo coordinator for the next step."),
        can_withdraw=participant is None and application.status != "withdrawn",
    )


@public_router.post("/status", response_model=RecruitmentStatusOut)
def application_status(payload: RecruitmentAccessIn, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return _public_status(_application_access(payload, db), db)


@public_router.post("/withdraw", response_model=RecruitmentStatusOut)
def withdraw_application(payload: RecruitmentAccessIn, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    application = _application_access(payload, db, lock=True)
    if db.scalar(select(Participant.id).where(Participant.application_id == application.id)):
        raise HTTPException(status_code=409, detail="Already enrolled. Contact the study coordinator for the participant withdrawal process.")
    if application.status != "withdrawn":
        previous = application.status
        application.status = "withdrawn"
        write_audit(db, actor=None, action="recruitment.application_withdrawn",
                    entity_type="recruitment_application", entity_id=application.id,
                    details={"reference_code": application.reference_code, "previous_status": previous})
        db.commit()
        db.refresh(application)
    return _public_status(application, db)
