from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.roles import PROJECT_READ_ROLES, PROJECT_TASK_WRITE_ROLES, PROJECT_WRITE_ROLES
from app.db.session import get_db
from app.models import Milestone, Project, Risk, StudyTask, TaskUpdate, User
from app.schemas.common import (
    MilestoneCreate,
    MilestoneOut,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    RiskCreate,
    RiskOut,
    TaskCreate,
    TaskOut,
    TaskUpdateIn,
)
from app.services.audit import write_audit


router = APIRouter(prefix="/api/projects", tags=["project management"])


def _project_or_404(db: Session, project_id: str) -> Project:
    item = db.get(Project, project_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return item


@router.get("", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROJECT_READ_ROLES)),
):
    return list(db.scalars(select(Project).order_by(Project.created_at.desc())))


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(
    payload: ProjectCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROJECT_WRITE_ROLES)),
):
    project = Project(
        **payload.model_dump(),
        created_by_id=user.id,
    )
    db.add(project)

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Project code already exists.") from exc

    write_audit(
        db,
        actor=user,
        action="project.created",
        entity_type="project",
        entity_id=project.id,
        details={"code": project.code, "name": project.name},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROJECT_READ_ROLES)),
):
    return _project_or_404(db, project_id)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROJECT_WRITE_ROLES)),
):
    project = _project_or_404(db, project_id)

    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(project, key, value)

    write_audit(
        db,
        actor=user,
        action="project.updated",
        entity_type="project",
        entity_id=project.id,
        details={"fields": sorted(changes.keys())},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}/milestones", response_model=list[MilestoneOut])
def list_milestones(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROJECT_READ_ROLES)),
):
    _project_or_404(db, project_id)
    return list(
        db.scalars(
            select(Milestone)
            .where(Milestone.project_id == project_id)
            .order_by(Milestone.created_at)
        )
    )


@router.post("/{project_id}/milestones", response_model=MilestoneOut, status_code=201)
def create_milestone(
    project_id: str,
    payload: MilestoneCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROJECT_WRITE_ROLES)),
):
    _project_or_404(db, project_id)

    milestone = Milestone(
        project_id=project_id,
        **payload.model_dump(),
    )
    db.add(milestone)

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Milestone code already exists in this project.",
        ) from exc

    write_audit(
        db,
        actor=user,
        action="milestone.created",
        entity_type="milestone",
        entity_id=milestone.id,
        details={"project_id": project_id, "code": milestone.code},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(milestone)
    return milestone


@router.get("/{project_id}/tasks", response_model=list[TaskOut])
def list_tasks(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROJECT_READ_ROLES)),
):
    _project_or_404(db, project_id)
    return list(
        db.scalars(
            select(StudyTask)
            .where(StudyTask.project_id == project_id)
            .order_by(StudyTask.created_at.desc())
        )
    )


@router.post("/{project_id}/tasks", response_model=TaskOut, status_code=201)
def create_task(
    project_id: str,
    payload: TaskCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROJECT_TASK_WRITE_ROLES)),
):
    _project_or_404(db, project_id)

    if payload.milestone_id:
        milestone = db.get(Milestone, payload.milestone_id)
        if milestone is None or milestone.project_id != project_id:
            raise HTTPException(status_code=400, detail="Milestone does not belong to this project.")

    task = StudyTask(
        project_id=project_id,
        created_by_id=user.id,
        **payload.model_dump(),
    )
    db.add(task)
    db.flush()

    write_audit(
        db,
        actor=user,
        action="task.created",
        entity_type="task",
        entity_id=task.id,
        details={"project_id": project_id, "title": task.title},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{project_id}/tasks/{task_id}", response_model=TaskOut)
def update_task(
    project_id: str,
    task_id: str,
    payload: TaskUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROJECT_TASK_WRITE_ROLES)),
):
    _project_or_404(db, project_id)

    task = db.get(StudyTask, task_id)
    if task is None or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task not found.")

    changes = payload.model_dump(exclude_unset=True)
    note = changes.pop("note", None)

    for key, value in changes.items():
        setattr(task, key, value)

    if note:
        db.add(
            TaskUpdate(
                task_id=task.id,
                author_id=user.id,
                note=note,
                status_snapshot=task.status,
            )
        )

    write_audit(
        db,
        actor=user,
        action="task.updated",
        entity_type="task",
        entity_id=task.id,
        details={"fields": sorted(changes.keys()), "note_added": bool(note)},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(task)
    return task


@router.get("/{project_id}/risks", response_model=list[RiskOut])
def list_risks(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROJECT_READ_ROLES)),
):
    _project_or_404(db, project_id)
    return list(
        db.scalars(
            select(Risk)
            .where(Risk.project_id == project_id)
            .order_by(Risk.created_at.desc())
        )
    )


@router.post("/{project_id}/risks", response_model=RiskOut, status_code=201)
def create_risk(
    project_id: str,
    payload: RiskCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PROJECT_TASK_WRITE_ROLES)),
):
    _project_or_404(db, project_id)

    risk = Risk(
        project_id=project_id,
        **payload.model_dump(),
    )
    db.add(risk)
    db.flush()

    write_audit(
        db,
        actor=user,
        action="risk.created",
        entity_type="risk",
        entity_id=risk.id,
        details={"project_id": project_id, "level": risk.level, "title": risk.title},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(risk)
    return risk
