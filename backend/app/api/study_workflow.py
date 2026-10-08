"""Synthetic-only study prototype. These forms are not clinical instruments."""
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.api.deps import require_roles
from app.core.config import settings
from app.core.roles import PARTICIPANT, PARTICIPANT_MANAGEMENT_ROLES
from app.db.session import get_db
from app.models import Participant, RecruitmentApplication, User
from app.models.study_workflow import StudyObservation
from app.services.audit import write_audit

router = APIRouter(prefix="/api/study-workflow", tags=["study workflow"])
VERSION = "synthetic-workflow-v1"
STAGES = ["pre", "session-1", "session-2", "session-3", "post"]
LABELS = {"pre": "Pre-test", "session-1": "Session 1", "session-2": "Session 2", "session-3": "Session 3", "post": "Post-test", "complete": "Complete", "allocation": "Awaiting group assignment", "inactive": "Participation inactive"}
# Fixed illustrative forms, not validated parallel clinical tests.
FORMS = {
    "pre": [
        ("After waiting an hour, Alex says, ‘That was quick.’ What is the likely meaning?", ["The wait was short", "The wait was too long", "Not sure / skip"], 1),
        ("‘The baker could not make enough dough.’ What makes this playful?", ["Dough can mean bread mixture or money", "Bakers never use dough", "Not sure / skip"], 0),
        ("‘The meeting begins at nine.’ Without more context, how does this read?", ["A joke", "A straightforward statement", "Not sure / skip"], 1),
        ("A message says ‘Nice job’ with no other information. What can be concluded?", ["It must be sarcastic", "More context is needed", "Not sure / skip"], 1),
    ],
    "post": [
        ("After a bus leaves early, Sam says, ‘Perfect timing.’ What is the likely meaning?", ["Frustration about missing the bus", "Praise for the bus", "Not sure / skip"], 0),
        ("‘The bicycle could not stand because it was two-tired.’ What makes this playful?", ["All bicycles are sleepy", "Two-tired sounds like too tired", "Not sure / skip"], 1),
        ("‘The library closes at six.’ Without more context, how does this read?", ["A straightforward statement", "A joke", "Not sure / skip"], 0),
        ("A message says ‘Great’ with no other information. What can be concluded?", ["More context is needed", "It must be sincere", "Not sure / skip"], 0),
    ],
}


class Submission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal["synthetic-workflow-v1"]
    answers: list[StrictInt] | None = None
    minutes: int | None = Field(default=None, ge=1, le=180, strict=True)
    assistance: Literal["none", "some", "substantial"] | None = None
    comfort: Literal["comfortable", "tiring", "upsetting", "prefer_not_to_say"] | None = None
    confirmed: bool = False


def _demo():
    if not settings.demo_mode:
        raise HTTPException(403, "Prototype activities are available only in synthetic demo mode.")


def _own(db, user, lock=False):
    if {role.name for role in user.roles} != {PARTICIPANT}:
        raise HTTPException(403, "A participant-only account is required.")
    query = select(Participant).where(Participant.user_id == user.id)
    if lock:
        query = query.with_for_update()
    participant = db.scalar(query)
    if participant is None:
        raise HTTPException(404, "A coordinator must link this login to an enrolled participant first.")
    return participant


def _rows(db, participant_id):
    return db.scalars(select(StudyObservation).where(StudyObservation.participant_id == participant_id).order_by(StudyObservation.created_at)).all()


def _next(participant, rows):
    if participant.lifecycle_status not in ("enrolled", "active"):
        return "inactive"
    # Baseline always precedes prototype practice; existing allocations are preserved.
    done = {row.stage for row in rows}
    if "pre" not in done:
        return "pre"
    if participant.allocation_status != "allocated":
        return "allocation"
    return next((stage for stage in STAGES if stage not in done), "complete")


def _summary(participant, rows, staff=False):
    result = {"participant_code": participant.participant_code,
              "condition": participant.study_group, "next_stage": _next(participant, rows),
              "account_linked": bool(participant.user_id), "completed_stages": [row.stage for row in rows],
              "observations": [{"stage": row.stage, "recorded_at": row.created_at.isoformat(), "version": row.instrument_version} for row in rows]}
    if staff:
        result["participant_id"] = participant.id
        result["scores"] = {row.stage: _score(row) for row in rows if row.stage in FORMS}
        result["session_minutes"] = sum(row.payload.get("minutes", 0) for row in rows)
        result["needs_review"] = any(row.payload.get("comfort") in ("tiring", "upsetting") for row in rows)
        result["observations"] = [{"stage": row.stage, "recorded_at": row.created_at.isoformat(), "version": row.instrument_version, "response": row.payload, "items": [{"prompt": q[0], "answer": q[1][answer], "reference": q[1][q[2]]} for q, answer in zip(FORMS.get(row.stage, []), row.payload.get("answers", []))]} for row in rows]
    return result


def _score(row):
    answers = row.payload["answers"]
    return {"correct": sum(a == q[2] for a, q in zip(answers, FORMS[row.stage])), "total": 4, "skipped": answers.count(2)}


@router.get("/me")
def own_progress(response: Response, db: Session = Depends(get_db), user: User = Depends(require_roles(PARTICIPANT))):
    _demo()
    response.headers["Cache-Control"] = "no-store"
    participant = _own(db, user)
    rows = _rows(db, participant.id)
    result = _summary(participant, rows)
    stage = result["next_stage"]
    result.update(version=VERSION, labels=LABELS, stages=STAGES,
                  questions=[{"prompt": q[0], "options": q[1]} for q in FORMS.get(stage, [])])
    return result


@router.post("/me/{stage}")
def submit(stage: str, payload: Submission, response: Response, db: Session = Depends(get_db), user: User = Depends(require_roles(PARTICIPANT))):
    _demo()
    response.headers["Cache-Control"] = "no-store"
    participant = _own(db, user, lock=True)
    from app.models.study_preparation import PreparedRun
    if db.scalar(select(PreparedRun.id).where(PreparedRun.participant_id == participant.id)):
        raise HTTPException(409, "This participant uses the configurable preparation workflow.")
    if stage not in STAGES:
        raise HTTPException(404, "Unknown study activity.")
    if not payload.confirmed:
        raise HTTPException(422, "Confirm this is a synthetic demonstration response.")
    if stage in FORMS:
        if payload.answers is None or len(payload.answers) != 4 or any(a not in (0, 1, 2) for a in payload.answers):
            raise HTTPException(422, "Answer all four items; use Not sure / skip where needed.")
        if any(x is not None for x in (payload.minutes, payload.assistance, payload.comfort)):
            raise HTTPException(422, "Assessment submissions accept answers only.")
    elif payload.answers is not None or any(x is None for x in (payload.minutes, payload.assistance, payload.comfort)):
        raise HTTPException(422, "Record duration, assistance, and comfort for the session.")
    data = payload.model_dump(exclude={"version", "confirmed"}, exclude_none=True)
    rows = _rows(db, participant.id)
    existing = next((row for row in rows if row.stage == stage), None)
    if existing:
        if existing.payload != data:
            raise HTTPException(409, "This activity is already submitted and cannot be overwritten.")
        return {"saved": True, "stage": stage, "duplicate": True}
    if _next(participant, rows) != stage:
        raise HTTPException(409, "Complete the current step before submitting this activity.")
    row = StudyObservation(participant_id=participant.id, stage=stage, instrument_version=VERSION, payload=data, recorded_by_id=user.id)
    db.add(row)
    write_audit(db, actor=user, action="study.activity_submitted", entity_type="participant", entity_id=participant.id,
                details={"stage": stage, "instrument_version": VERSION, "synthetic_only": True})
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This activity was already saved. Refresh the study page.")
    return {"saved": True, "stage": stage, "duplicate": False}


@router.get("/dashboard")
def dashboard(response: Response, db: Session = Depends(get_db), user: User = Depends(require_roles(*PARTICIPANT_MANAGEMENT_ROLES))):
    _demo()
    response.headers["Cache-Control"] = "no-store"
    from app.models.study_preparation import PreparedRun
    participants = db.scalars(select(Participant).where(~Participant.id.in_(select(PreparedRun.participant_id))).order_by(Participant.enrolled_at.desc())).all()
    records = db.scalars(select(StudyObservation)).all()
    by_participant = {}
    for row in records:
        by_participant.setdefault(row.participant_id, []).append(row)
    entries = [_summary(p, by_participant.get(p.id, []), staff=True) for p in participants]
    statuses = db.scalars(select(RecruitmentApplication.status)).all()
    paired = [p for p in entries if "pre" in p["scores"] and "post" in p["scores"]]
    return {"version": VERSION, "labels": LABELS, "participants": entries,
            "counts": {"applications": len(statuses), "needs_review": sum(s in ("submitted", "under_review", "needs_review") for s in statuses),
                       "enrolled": len(entries), "pre_completed": sum("pre" in p["scores"] for p in entries),
                       "post_completed": len(paired), "session_records": sum(r.stage.startswith("session-") for r in records),
                       "comfort_review": sum(p["needs_review"] for p in entries)},
            "paired": {"n": len(paired), "mean_change": round(sum(p["scores"]["post"]["correct"] - p["scores"]["pre"]["correct"] for p in paired) / len(paired), 2) if paired else None}}
