from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.roles import ALLOCATION_ROLES, PARTICIPANT_MANAGEMENT_ROLES, PROJECT_READ_ROLES
from app.db.base import utcnow
from app.db.session import get_db
from app.models import (
    AllocationState,
    Participant,
    ParticipantAllocation,
    User,
)
from app.schemas.common import (
    AllocationSummaryOut,
    ParticipantAllocationOut,
    ParticipantMetricsOut,
    ParticipantOut,
)
from app.services.audit import write_audit


router = APIRouter(prefix="/api/participants", tags=["participants"])
TARGET_PARTICIPANTS = 600
TARGET_PER_GROUP = 200
STUDY_GROUPS = ("HumorBot", "STARCASM", "Control")
ALLOCATION_METHOD = "balanced_random"
ALGORITHM_VERSION = "balanced_random_v1"


def _group_counts(db: Session) -> dict[str, int]:
    rows = db.execute(
        select(ParticipantAllocation.study_group, func.count(ParticipantAllocation.id))
        .group_by(ParticipantAllocation.study_group)
    ).all()
    found = {str(group): int(count) for group, count in rows}
    return {group: found.get(group, 0) for group in STUDY_GROUPS}


def _ensure_allocation_state(db: Session) -> AllocationState:
    state = db.scalar(
        select(AllocationState)
        .where(AllocationState.key == "primary")
        .with_for_update()
    )
    if state is None:
        state = AllocationState(
            key="primary",
            algorithm_version=ALGORITHM_VERSION,
            updated_at=utcnow(),
        )
        db.add(state)
        db.flush()
    return state


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
    groups = _group_counts(db)
    return ParticipantMetricsOut(
        participants=total,
        enrolled=enrolled,
        allocated=allocated,
        not_allocated=not_allocated,
        remaining_target=max(TARGET_PARTICIPANTS - total, 0),
        humorbot=groups["HumorBot"],
        starcasm=groups["STARCASM"],
        control=groups["Control"],
    )


@router.get("/allocation-summary", response_model=AllocationSummaryOut)
def allocation_summary(
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(*(PARTICIPANT_MANAGEMENT_ROLES | PROJECT_READ_ROLES))
    ),
):
    groups = _group_counts(db)
    allocated = sum(groups.values())
    not_allocated = int(
        db.scalar(
            select(func.count(Participant.id)).where(
                Participant.allocation_status == "not_allocated"
            )
        )
        or 0
    )
    return AllocationSummaryOut(
        target_total=TARGET_PARTICIPANTS,
        target_per_group=TARGET_PER_GROUP,
        allocated=allocated,
        not_allocated=not_allocated,
        remaining_capacity=max(TARGET_PARTICIPANTS - allocated, 0),
        groups=groups,
        algorithm_version=ALGORITHM_VERSION,
        method=ALLOCATION_METHOD,
        protocol_finalized=False,
    )


@router.post("/{participant_id}/allocate", response_model=ParticipantAllocationOut)
def allocate_participant(
    participant_id: str,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*ALLOCATION_ROLES)),
):
    # A singleton row serializes allocation decisions on PostgreSQL. This keeps
    # the 200/200/200 capacity check and balanced assignment in one transaction.
    state = _ensure_allocation_state(db)

    participant = db.scalar(
        select(Participant)
        .where(Participant.id == participant_id)
        .with_for_update()
    )
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found.")

    existing = db.scalar(
        select(ParticipantAllocation).where(
            ParticipantAllocation.participant_id == participant.id
        )
    )
    if existing is not None:
        # Allocation is immutable/idempotent. A retry returns the recorded result.
        return existing

    if participant.lifecycle_status != "enrolled":
        raise HTTPException(
            status_code=409,
            detail="Only an enrolled participant can be allocated.",
        )
    if participant.allocation_status != "not_allocated" or participant.study_group:
        raise HTTPException(
            status_code=409,
            detail="Participant allocation state is already set.",
        )

    counts = _group_counts(db)
    available = [group for group in STUDY_GROUPS if counts[group] < TARGET_PER_GROUP]
    if not available:
        raise HTTPException(
            status_code=409,
            detail="The 600-participant allocation capacity is full.",
        )

    # Foundation algorithm: allocate only among groups with the current minimum
    # count, then use a cryptographically strong random tie-break. This preserves
    # 1:1:1 balance while avoiding administrator-selected assignment. It is
    # explicitly provisional until the final protocol defines stratification.
    minimum = min(counts[group] for group in available)
    tied = [group for group in available if counts[group] == minimum]
    random_draw = secrets.randbits(64)
    tie_index = random_draw % len(tied)
    chosen = tied[tie_index]
    basis = {
        "counts_before": counts,
        "minimum_count": minimum,
        "tie_candidates": tied,
        "random_draw_hex": f"{random_draw:016x}",
        "tie_index": tie_index,
        "target_per_group": TARGET_PER_GROUP,
        "target_total": TARGET_PARTICIPANTS,
        "protocol_finalized": False,
    }

    allocation = ParticipantAllocation(
        participant_id=participant.id,
        study_group=chosen,
        method=ALLOCATION_METHOD,
        algorithm_version=state.algorithm_version,
        allocation_basis=basis,
        allocated_by_id=user.id,
        allocated_at=utcnow(),
    )
    participant.study_group = chosen
    participant.allocation_status = "allocated"
    state.updated_at = utcnow()
    db.add(allocation)

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        winner = db.scalar(
            select(ParticipantAllocation).where(
                ParticipantAllocation.participant_id == participant_id
            )
        )
        if winner is not None:
            return winner
        raise HTTPException(
            status_code=409,
            detail="Participant allocation conflicted with an existing record.",
        ) from exc

    write_audit(
        db,
        actor=user,
        action="participant.allocated",
        entity_type="participant",
        entity_id=participant.id,
        details={
            "participant_code": participant.participant_code,
            "study_group": chosen,
            "method": ALLOCATION_METHOD,
            "algorithm_version": state.algorithm_version,
            "counts_before": counts,
            "tie_candidates": tied,
            "random_draw_hex": f"{random_draw:016x}",
            "tie_index": tie_index,
            "protocol_finalized": False,
        },
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(allocation)
    response.status_code = status.HTTP_201_CREATED
    return allocation


@router.get("/{participant_id}/allocation", response_model=ParticipantAllocationOut)
def get_participant_allocation(
    participant_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PARTICIPANT_MANAGEMENT_ROLES)),
):
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found.")
    allocation = db.scalar(
        select(ParticipantAllocation).where(
            ParticipantAllocation.participant_id == participant_id
        )
    )
    if allocation is None:
        raise HTTPException(status_code=404, detail="Participant is not allocated.")
    return allocation


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
