from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.study_preparation import router as preparation_router
from app.api.study_workflow import router as workflow_router
from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.projects import router as projects_router
from app.api.participants import router as participants_router
from app.api.participants import self_router as participant_self_router
from app.api.recruitment import public_router as public_recruitment_router
from app.api.recruitment import staff_router as recruitment_router
from app.api.study_protocols import router as study_protocols_router
from app.core.config import settings
from app.db.session import SessionLocal
from app.services.seed import seed_roles_and_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    with SessionLocal() as db:
        seed_roles_and_admin(db)

    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(preparation_router)
app.include_router(workflow_router)
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(public_recruitment_router)
app.include_router(recruitment_router)
app.include_router(participants_router)
app.include_router(participant_self_router)
app.include_router(study_protocols_router)
app.include_router(admin_router)


@app.get("/health", tags=["system"])
def health():
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "demo_mode": settings.demo_mode,
    }


@app.get("/health/ready", tags=["system"])
def readiness():
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Database is not ready.",
        ) from exc

    return {
        "status": "ready",
        "database": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "demo_mode": settings.demo_mode,
    }
