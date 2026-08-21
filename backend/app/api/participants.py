from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.roles import PARTICIPANT_MANAGEMENT_ROLES
from app.db.session import get_db
from app.models import (
    Participant,
    User,
)
from app.schemas.common import ParticipantMetricsOut, ParticipantOut


router = APIRouter(prefix="/api/participants", tags=["participants"])
TARGET_PARTICIPANTS = 600


@router.get("", response_model=list[ParticipantOut])
def list_participants(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PARTICIPANT_MANAGEMENT_ROLES)),
):
    return list(db.scalars(select(Participant).order_by(Participant.enrolled_at.desc())))


@router.get("/metrics", response_model=ParticipantMetricsOut)
def participant_metrics(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PARTICIPANT_MANAGEMENT_ROLES)),
):
    total = int(db.scalar(select(func.count(Participant.id))) or 0)
    enrolled = int(
        db.scalar(
            select(func.count(Participant.id)).where(
                Participant.lifecycle_status == "enrolled"
            )
        )
        or 0
    )
    allocated = int(
        db.scalar(
            select(func.count(Participant.id)).where(
                Participant.allocation_status == "allocated"
            )
        )
        or 0
    )
    not_allocated = int(
        db.scalar(
            select(func.count(Participant.id)).where(
                Participant.allocation_status == "not_allocated"
            )
        )
        or 0
    )
    return ParticipantMetricsOut(
        participants=total,
        enrolled=enrolled,
        allocated=allocated,
        not_allocated=not_allocated,
        remaining_target=max(TARGET_PARTICIPANTS - total, 0),
    )


@router.get("/{participant_id}", response_model=ParticipantOut)
def get_participant(
    participant_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PARTICIPANT_MANAGEMENT_ROLES)),
):
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found.")
    return participant
