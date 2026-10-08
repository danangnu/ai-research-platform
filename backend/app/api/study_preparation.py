"""Configurable, synthetic-only preparation. No clinical activation endpoint."""

from datetime import datetime, timedelta, timezone
import hashlib
import json
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.api.deps import require_roles
from app.api.study_workflow import _demo, _own
from app.core.roles import (
    PARTICIPANT,
    PARTICIPANT_MANAGEMENT_ROLES,
    PROTOCOL_WRITE_ROLES,
)
from app.db.session import get_db
from app.models import Participant, User
from app.models.study_workflow import StudyObservation
from app.models.study_preparation import (
    PreparedConfiguration,
    PreparedRun,
    PreparedObservation,
)
from app.schemas.study_preparation import Configuration, Assignment, Submission
from app.services.audit import write_audit

router = APIRouter(prefix="/api/study-preparation", tags=["study preparation"])
STAFF = Depends(require_roles(*PARTICIPANT_MANAGEMENT_ROLES))
WRITE = Depends(require_roles(*PROTOCOL_WRITE_ROLES))
SELF = Depends(require_roles(PARTICIPANT))
DB = Depends(get_db)


def now():
    return datetime.now(timezone.utc)


def utc(value):
    return (
        value.replace(tzinfo=timezone.utc)
        if value.tzinfo is None
        else value.astimezone(timezone.utc)
    )


def guard(response):
    _demo()
    response.headers["Cache-Control"] = "no-store"


def observations(db, run):
    return db.scalars(
        select(PreparedObservation)
        .where(PreparedObservation.run_id == run.id)
        .order_by(PreparedObservation.created_at)
    ).all()


def readiness(definition):
    return [stage for stage, form in definition["forms"].items() if not form["items"]]


def public_form(form):
    if form is None:
        return None
    return {
        k: v
        for k, v in form.items()
        if k in ("title", "instrument_version", "instructions")
    } | {
        "items": [
            {k: v for k, v in item.items() if k != "options"}
            | {
                "options": [
                    {"value": o["value"], "label": o["label"]} for o in item["options"]
                ]
            }
            for item in form["items"]
        ]
    }


def score_bounds(form):
    if form["scoring"] != "sum_choice" or not form["items"]:
        return None
    return [
        sum(min(o["points"] for o in q["options"]) for q in form["items"]),
        sum(max(o["points"] for o in q["options"]) for q in form["items"]),
    ]


def comparable(definition):
    pre, post = definition["forms"]["pre"], definition["forms"]["post"]
    return bool(
        pre["scale_id"]
        and pre["scale_id"] == post["scale_id"]
        and score_bounds(pre) is not None
        and score_bounds(pre) == score_bounds(post)
    )


def progress(db, participant, run, staff=False):
    config = db.get(PreparedConfiguration, run.configuration_id)
    spec = config.definition
    rows = observations(db, run)
    done = {r.stage for r in rows}
    day = (
        int((now() - utc(run.started_at)).total_seconds() // 86400)
        if run.started_at
        else None
    )
    due = (
        utc(run.started_at) + timedelta(days=spec["schedule"]["duration_days"])
        if run.started_at
        else None
    )
    if participant.lifecycle_status not in ("enrolled", "active"):
        stage = "inactive"
    elif "questionnaire" not in done:
        stage = "questionnaire"
    elif "pre" not in done:
        stage = "pre"
    elif participant.allocation_status != "allocated":
        stage = "allocation"
    elif not run.started_at:
        stage = "awaiting_start"
    elif "post" in done:
        stage = "complete"
    elif now() >= due:
        stage = "post"
    else:
        stage = f"session-{day + 1}" if f"session-{day + 1}" not in done else "waiting"
    next_session = (
        utc(run.started_at) + timedelta(days=day + 1)
        if run.started_at and stage == "waiting"
        else None
    )
    result = {
        "assigned": True,
        "participant_code": participant.participant_code,
        "condition": participant.study_group,
        "configuration_id": config.id,
        "version": config.version,
        "title": spec["title"],
        "schedule": spec["schedule"],
        "interaction_note": spec["interaction_note"],
        "next_stage": stage,
        "study_day": day,
        "started_at": utc(run.started_at).isoformat() if run.started_at else None,
        "post_due_at": due.isoformat() if due else None,
        "next_session_at": next_session.isoformat() if next_session else None,
        "interim_due_at": (
            utc(run.started_at) + timedelta(days=spec["schedule"]["interim_day"])
        ).isoformat()
        if run.started_at and spec["schedule"]["interim_day"]
        else None,
        "form": public_form(spec["forms"].get(stage)),
        "observations": [
            {"stage": r.stage, "recorded_at": utc(r.created_at).isoformat()}
            for r in rows
        ],
    }
    if staff:
        scores = {r.stage: r.score for r in rows if r.score is not None}
        a, b = scores.get("pre", {}).get("value"), scores.get("post", {}).get("value")
        result.update(
            participant_id=participant.id,
            scores=scores,
            definition_hash=config.definition_hash,
            paired_change=b - a
            if comparable(spec) and a is not None and b is not None
            else None,
            reported_minutes=sum(r.payload.get("minutes", 0) for r in rows),
            session_count=sum(r.stage.startswith("session-") for r in rows),
            needs_review=any(
                r.payload.get("comfort") in ("tiring", "upsetting") for r in rows
            ),
            observations=[
                {
                    "stage": r.stage,
                    "recorded_at": utc(r.created_at).isoformat(),
                    "response": r.payload,
                    "score": r.score,
                }
                for r in rows
            ],
        )
    return result


def commit(db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409,
            "A record with this identifier already exists. Refresh before retrying.",
        )


@router.get("/configurations")
def configurations(response: Response, db: Session = DB, user: User = STAFF):
    guard(response)
    return [
        {
            "id": c.id,
            "version": c.version,
            "definition": c.definition,
            "definition_hash": c.definition_hash,
            "missing_forms": readiness(c.definition),
        }
        for c in db.scalars(
            select(PreparedConfiguration).order_by(
                PreparedConfiguration.created_at.desc()
            )
        ).all()
    ]


@router.post("/configurations", status_code=201)
def create_configuration(
    payload: Configuration, response: Response, db: Session = DB, user: User = WRITE
):
    guard(response)
    spec = payload.model_dump()
    digest = hashlib.sha256(
        json.dumps(
            spec, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode()
    ).hexdigest()
    row = PreparedConfiguration(
        version=payload.version,
        definition=spec,
        definition_hash=digest,
        created_by_id=user.id,
    )
    db.add(row)
    write_audit(
        db,
        actor=user,
        action="study.preparation_version_created",
        entity_type="study_preparation",
        entity_id=None,
        details={
            "version": payload.version,
            "definition_hash": digest,
            "synthetic_only": True,
        },
    )
    commit(db)
    return {"id": row.id, "version": row.version, "missing_forms": readiness(spec)}


@router.post("/runs/{participant_id}")
def assign(
    participant_id: str,
    payload: Assignment,
    response: Response,
    db: Session = DB,
    user: User = WRITE,
):
    guard(response)
    participant = db.scalar(
        select(Participant).where(Participant.id == participant_id).with_for_update()
    )
    config = db.get(PreparedConfiguration, payload.configuration_id)
    if participant is None or config is None:
        raise HTTPException(404, "Participant or configuration not found.")
    if participant.lifecycle_status not in ("enrolled", "active"):
        raise HTTPException(409, "Participant is inactive.")
    if readiness(config.definition):
        raise HTTPException(
            409,
            "Questionnaire and both assessments need items before a fictional walkthrough.",
        )
    existing = db.scalar(
        select(PreparedRun).where(PreparedRun.participant_id == participant_id)
    )
    if existing:
        if existing.configuration_id != config.id:
            raise HTTPException(
                409, "This participant is already pinned to a different version."
            )
        return {"id": existing.id, "duplicate": True}
    if db.scalar(
        select(StudyObservation.id)
        .where(StudyObservation.participant_id == participant_id)
        .limit(1)
    ):
        raise HTTPException(
            409,
            "Use a new fictional participant. Existing demo records must remain in their original workflow.",
        )
    run = PreparedRun(participant_id=participant_id, configuration_id=config.id)
    db.add(run)
    write_audit(
        db,
        actor=user,
        action="study.preparation_assigned",
        entity_type="participant",
        entity_id=participant_id,
        details={
            "configuration_id": config.id,
            "definition_hash": config.definition_hash,
        },
    )
    commit(db)
    return {"id": run.id, "duplicate": False}


@router.post("/runs/{participant_id}/start")
def start(
    participant_id: str, response: Response, db: Session = DB, user: User = WRITE
):
    guard(response)
    participant = db.scalar(
        select(Participant).where(Participant.id == participant_id).with_for_update()
    )
    run = db.scalar(
        select(PreparedRun).where(PreparedRun.participant_id == participant_id)
    )
    if participant is None or run is None:
        raise HTTPException(404, "Prepared participant not found.")
    if participant.lifecycle_status not in ("enrolled", "active"):
        raise HTTPException(409, "Participant is inactive.")
    if run.started_at:
        return {"started_at": utc(run.started_at).isoformat(), "duplicate": True}
    if progress(db, participant, run)["next_stage"] != "awaiting_start":
        raise HTTPException(
            409,
            "Save the questionnaire and baseline, then complete allocation before starting.",
        )
    run.started_at = now()
    write_audit(
        db,
        actor=user,
        action="study.preparation_started",
        entity_type="participant",
        entity_id=participant_id,
        details={
            "configuration_id": run.configuration_id,
            "started_at": run.started_at.isoformat(),
        },
    )
    commit(db)
    return {"started_at": utc(run.started_at).isoformat(), "duplicate": False}


@router.get("/me")
def me(response: Response, db: Session = DB, user: User = SELF):
    guard(response)
    p = _own(db, user)
    run = db.scalar(select(PreparedRun).where(PreparedRun.participant_id == p.id))
    return progress(db, p, run) if run else {"assigned": False}


def validate_answers(form, answers):
    if answers is None or set(answers) != {q["id"] for q in form["items"]}:
        raise HTTPException(
            422,
            "Provide exactly the configured item identifiers; use null for a skipped item.",
        )
    skipped = 0
    total = 0
    for q in form["items"]:
        value = answers[q["id"]]
        if value is None:
            if q["required"]:
                raise HTTPException(422, f"Answer required item {q['id']}.")
            skipped += 1
            continue
        if q["kind"] == "choice":
            option = next((o for o in q["options"] if o["value"] == value), None)
            if option is None:
                raise HTTPException(422, "Invalid choice.")
            total += option["points"] or 0
        elif q["kind"] == "text":
            if not isinstance(value, str) or not value.strip() or len(value) > 10000:
                raise HTTPException(
                    422, "Text responses must contain 1 to 10000 characters."
                )
        elif (
            type(value) not in (int, float)
            or (q["minimum"] is not None and value < q["minimum"])
            or (q["maximum"] is not None and value > q["maximum"])
        ):
            raise HTTPException(422, "Number is outside the configured range.")
    if form["scoring"] == "none":
        return None
    low, high = score_bounds(form)
    return {
        "value": total if not skipped else None,
        "minimum": low,
        "maximum": high,
        "skipped": skipped,
        "scale_id": form["scale_id"],
        "instrument_version": form["instrument_version"],
    }


@router.post("/me/{stage}")
def submit(
    stage: str,
    payload: Submission,
    response: Response,
    db: Session = DB,
    user: User = SELF,
):
    guard(response)
    p = _own(db, user, lock=True)
    if p.lifecycle_status not in ("enrolled", "active"):
        raise HTTPException(409, "Participation is inactive.")
    run = db.scalar(select(PreparedRun).where(PreparedRun.participant_id == p.id))
    if run is None or run.configuration_id != payload.configuration_id:
        raise HTTPException(
            409, "Study version changed or no prepared workflow was assigned. Refresh."
        )
    data = payload.model_dump(
        exclude={"configuration_id", "confirmed_synthetic"}, exclude_none=True
    )
    existing = db.scalar(
        select(PreparedObservation).where(
            PreparedObservation.run_id == run.id, PreparedObservation.stage == stage
        )
    )
    if existing:
        if existing.payload != data:
            raise HTTPException(409, "A saved response cannot be overwritten.")
        return {"saved": True, "duplicate": True}
    state = progress(db, p, run)
    if state["next_stage"] != stage or (
        stage not in ("questionnaire", "pre", "post")
        and not stage.startswith("session-")
    ):
        raise HTTPException(409, "This activity is not currently available.")
    spec = db.get(PreparedConfiguration, run.configuration_id).definition
    score = None
    if stage in spec["forms"]:
        if any(
            x is not None
            for x in (payload.minutes, payload.assistance, payload.comfort)
        ):
            raise HTTPException(422, "Assessment accepts answers only.")
        score = validate_answers(spec["forms"][stage], payload.answers)
    elif payload.answers is not None or any(
        x is None for x in (payload.minutes, payload.assistance, payload.comfort)
    ):
        raise HTTPException(422, "Record minutes, assistance and comfort only.")
    db.add(
        PreparedObservation(
            run_id=run.id,
            stage=stage,
            payload=data,
            score=score,
            recorded_by_id=user.id,
        )
    )
    write_audit(
        db,
        actor=user,
        action="study.prepared_response_saved",
        entity_type="participant",
        entity_id=p.id,
        details={
            "stage": stage,
            "configuration_id": run.configuration_id,
            "synthetic_only": True,
        },
    )
    commit(db)
    return {"saved": True, "duplicate": False}


@router.get("/dashboard")
def dashboard(response: Response, db: Session = DB, user: User = STAFF):
    guard(response)
    rows = db.execute(
        select(Participant, PreparedRun).join(
            PreparedRun, Participant.id == PreparedRun.participant_id
        )
    ).all()
    return {"participants": [progress(db, p, r, staff=True) for p, r in rows]}


@router.get("/export")
def export(response: Response, db: Session = DB, user: User = STAFF):
    guard(response)
    from app.services.study_export import package

    data, counts = package(db, now().isoformat())
    write_audit(
        db,
        actor=user,
        action="study.research_export",
        entity_type="study_preparation",
        entity_id=None,
        details={"row_counts": counts, "synthetic_only": True},
    )
    commit(db)
    return Response(
        data,
        media_type="application/zip",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": 'attachment; filename="study-research-export.zip"',
        },
    )
