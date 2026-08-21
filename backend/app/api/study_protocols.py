from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.roles import PROTOCOL_READ_ROLES, PROTOCOL_WRITE_ROLES
from app.db.base import utcnow
from app.db.session import get_db
from app.models import Project, StudyProtocol, User
from app.schemas.common import (
    ProtocolSummaryOut,
    ProtocolValidationOut,
    StudyProtocolCreate,
    StudyProtocolOut,
    StudyProtocolUpdate,
)
from app.services.audit import write_audit


router = APIRouter(prefix="/api/study/protocols", tags=["study protocols"])

EXPECTED_CONDITIONS = {
    "HumorBot": 200,
    "STARCASM": 200,
    "Control": 200,
}
ACTIVATION_BLOCKER = (
    "Protocol activation is reserved for Step 1D.2, when the approved "
    "stratified allocation engine and migration rules are connected."
)


def _protocol_or_404(db: Session, protocol_id: str, *, lock: bool = False) -> StudyProtocol:
    query = select(StudyProtocol).where(StudyProtocol.id == protocol_id)
    if lock:
        query = query.with_for_update()
    protocol = db.scalar(query)
    if protocol is None:
        raise HTTPException(status_code=404, detail="Study protocol not found.")
    return protocol


def _canonical_configuration(protocol: StudyProtocol) -> dict:
    return {
        "project_id": protocol.project_id,
        "version": protocol.version,
        "title": protocol.title,
        "objective": protocol.objective,
        "randomization_unit": protocol.randomization_unit,
        "allocation_method": protocol.allocation_method,
        "target_total": protocol.target_total,
        "conditions": protocol.conditions,
        "stratification_factors": protocol.stratification_factors,
        "task_blocks": protocol.task_blocks,
        "permitted_block_sizes": protocol.permitted_block_sizes,
        "protocol_document_ref": protocol.protocol_document_ref,
        "change_summary": protocol.change_summary,
        "supersedes_protocol_id": protocol.supersedes_protocol_id,
    }


def _configuration_hash(protocol: StudyProtocol) -> str:
    encoded = json.dumps(
        _canonical_configuration(protocol),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _validate_protocol(protocol: StudyProtocol) -> ProtocolValidationOut:
    errors: list[str] = []
    warnings: list[str] = [
        "Existing balanced_random_v1 demo allocations are not governed by this protocol version."
    ]

    if protocol.randomization_unit != "participant":
        errors.append("Randomization unit must be participant for this study.")
    if protocol.allocation_method != "stratified_permuted_block":
        errors.append("Allocation method must be stratified_permuted_block.")
    if protocol.target_total != 600:
        errors.append("Study target must remain 600 participants.")

    conditions = list(protocol.conditions or [])
    condition_codes = [str(item.get("code", "")).strip() for item in conditions]
    if len(condition_codes) != len(set(condition_codes)):
        errors.append("Condition codes must be unique.")
    targets = {
        str(item.get("code", "")).strip(): int(item.get("target_n", 0) or 0)
        for item in conditions
    }
    if targets != EXPECTED_CONDITIONS:
        errors.append("Conditions must be HumorBot, STARCASM and Control with target 200 each.")
    if sum(targets.values()) != protocol.target_total:
        errors.append("Condition targets must sum to the protocol target total.")

    factors = list(protocol.stratification_factors or [])
    if not factors:
        errors.append("At least one stratification factor is required.")
    factor_keys = [str(item.get("key", "")).strip() for item in factors]
    if len(factor_keys) != len(set(factor_keys)):
        errors.append("Stratification factor keys must be unique.")
    for factor in factors:
        key = str(factor.get("key", "")).strip() or "unnamed"
        levels = list(factor.get("levels") or [])
        level_codes = [str(item.get("code", "")).strip() for item in levels]
        if len(level_codes) < 2:
            errors.append(f"Stratification factor {key} must define at least two levels.")
        if len(level_codes) != len(set(level_codes)):
            errors.append(f"Stratification factor {key} level codes must be unique.")
        if not bool(factor.get("required", False)):
            errors.append(f"Stratification factor {key} must be required for allocation.")

    task_blocks = list(protocol.task_blocks or [])
    task_codes = [str(item.get("code", "")).strip() for item in task_blocks]
    if len(task_codes) < 2:
        errors.append("The multiple-task design must define at least two task blocks.")
    if len(task_codes) != len(set(task_codes)):
        errors.append("Task-block codes must be unique.")

    block_sizes = list(protocol.permitted_block_sizes or [])
    condition_count = len(EXPECTED_CONDITIONS)
    if not block_sizes:
        errors.append("At least one permitted block size is required.")
    if len(block_sizes) != len(set(block_sizes)):
        errors.append("Permitted block sizes must be unique.")
    if any(size < condition_count or size % condition_count != 0 for size in block_sizes):
        errors.append("Every block size must be a positive multiple of the three conditions.")

    if not protocol.protocol_document_ref.strip():
        errors.append("An approved protocol document reference is required before approval.")

    digest = _configuration_hash(protocol)
    return ProtocolValidationOut(
        protocol_id=protocol.id,
        valid=not errors,
        approval_ready=not errors,
        activation_ready=False,
        errors=errors,
        warnings=warnings,
        configuration_hash=digest,
        activation_blocker=ACTIVATION_BLOCKER,
    )


@router.get("", response_model=list[StudyProtocolOut])
def list_protocols(
    project_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROTOCOL_READ_ROLES)),
):
    query = select(StudyProtocol)
    if project_id:
        query = query.where(StudyProtocol.project_id == project_id)
    return list(db.scalars(query.order_by(StudyProtocol.created_at.desc())))


@router.get("/summary", response_model=ProtocolSummaryOut)
def protocol_summary(
    project_id: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROTOCOL_READ_ROLES)),
):
    base = select(StudyProtocol)
    if project_id:
        base = base.where(StudyProtocol.project_id == project_id)
    protocols = list(db.scalars(base.order_by(StudyProtocol.created_at.desc())))
    return ProtocolSummaryOut(
        total_versions=len(protocols),
        drafts=sum(item.status == "draft" for item in protocols),
        approved=sum(item.status == "approved" for item in protocols),
        active=sum(item.status == "active" for item in protocols),
        latest_protocol_id=protocols[0].id if protocols else None,
        allocation_engine_connected=False,
    )


@router.post("", response_model=StudyProtocolOut, status_code=201)
def create_protocol(
    payload: StudyProtocolCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROTOCOL_WRITE_ROLES)),
):
    if db.get(Project, payload.project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    if payload.supersedes_protocol_id:
        predecessor = db.get(StudyProtocol, payload.supersedes_protocol_id)
        if predecessor is None or predecessor.project_id != payload.project_id:
            raise HTTPException(
                status_code=400,
                detail="Superseded protocol must belong to the same project.",
            )

    protocol = StudyProtocol(
        **payload.model_dump(),
        status="draft",
        created_by_id=user.id,
    )
    db.add(protocol)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Protocol version already exists in this project.",
        ) from exc

    write_audit(
        db,
        actor=user,
        action="protocol.created",
        entity_type="study_protocol",
        entity_id=protocol.id,
        details={
            "project_id": protocol.project_id,
            "version": protocol.version,
            "status": protocol.status,
        },
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(protocol)
    return protocol


@router.get("/{protocol_id}", response_model=StudyProtocolOut)
def get_protocol(
    protocol_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROTOCOL_READ_ROLES)),
):
    return _protocol_or_404(db, protocol_id)


@router.patch("/{protocol_id}", response_model=StudyProtocolOut)
def update_protocol(
    protocol_id: str,
    payload: StudyProtocolUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROTOCOL_WRITE_ROLES)),
):
    protocol = _protocol_or_404(db, protocol_id, lock=True)
    if protocol.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Approved protocol versions are immutable; create a new version instead.",
        )

    changes = payload.model_dump(exclude_unset=True)
    if "supersedes_protocol_id" in changes and changes["supersedes_protocol_id"]:
        predecessor = db.get(StudyProtocol, changes["supersedes_protocol_id"])
        if (
            predecessor is None
            or predecessor.project_id != protocol.project_id
            or predecessor.id == protocol.id
        ):
            raise HTTPException(
                status_code=400,
                detail="Superseded protocol must be a different version in the same project.",
            )
    for key, value in changes.items():
        setattr(protocol, key, value)

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Protocol version already exists in this project.",
        ) from exc

    write_audit(
        db,
        actor=user,
        action="protocol.updated",
        entity_type="study_protocol",
        entity_id=protocol.id,
        details={"version": protocol.version, "fields": sorted(changes.keys())},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(protocol)
    return protocol


@router.get("/{protocol_id}/validation", response_model=ProtocolValidationOut)
def validate_protocol(
    protocol_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROTOCOL_READ_ROLES)),
):
    return _validate_protocol(_protocol_or_404(db, protocol_id))


@router.post("/{protocol_id}/approve", response_model=StudyProtocolOut)
def approve_protocol(
    protocol_id: str,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROTOCOL_WRITE_ROLES)),
):
    protocol = _protocol_or_404(db, protocol_id, lock=True)
    if protocol.status == "approved":
        return protocol
    if protocol.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft protocols can be approved.")

    validation = _validate_protocol(protocol)
    if not validation.approval_ready:
        raise HTTPException(
            status_code=409,
            detail="Protocol is not approval-ready: " + "; ".join(validation.errors),
        )

    protocol.status = "approved"
    protocol.configuration_hash = validation.configuration_hash
    protocol.approved_by_id = user.id
    protocol.approved_at = utcnow()
    write_audit(
        db,
        actor=user,
        action="protocol.approved",
        entity_type="study_protocol",
        entity_id=protocol.id,
        details={
            "project_id": protocol.project_id,
            "version": protocol.version,
            "configuration_hash": protocol.configuration_hash,
        },
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(protocol)
    return protocol


@router.post("/{protocol_id}/activate", response_model=StudyProtocolOut)
def activate_protocol(
    protocol_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROTOCOL_WRITE_ROLES)),
):
    _protocol_or_404(db, protocol_id)
    raise HTTPException(status_code=409, detail=ACTIVATION_BLOCKER)
