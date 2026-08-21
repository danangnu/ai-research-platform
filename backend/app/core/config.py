from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_database_url(value: str) -> str:
    """Normalize hosted PostgreSQL URLs for SQLAlchemy + psycopg 3."""
    text = str(value).strip()

    if text.startswith("postgres://"):
        return "postgresql+psycopg://" + text[len("postgres://"):]

    if text.startswith("postgresql://"):
        return "postgresql+psycopg://" + text[len("postgresql://"):]

    return text


class Settings(BaseSettings):
    app_name: str = "AI Research Study Management Platform"
    app_version: str = "0.3.0-step1c1"
    database_url: str = (
        "postgresql+psycopg://research:"
        "research-dev-password@localhost:5432/ai_research"
    )

    jwt_secret: str = "dev-only-change-me"
    access_token_minutes: int = 480
    cors_origins: str = "http://localhost:5173"

    admin_email: str = "admin@example.com"
    admin_password: str = "ChangeMe123!"
    admin_full_name: str = "Project Administrator"

    demo_mode: bool = False
    demo_participant_email: str = ""
    demo_participant_password: str = ""
    demo_participant_full_name: str = "Demo Participant"

    recruitment_open: bool = False
    screening_consent_version: str = "DEMO-STEP1B-v1"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_db_url(cls, value):
        return normalize_database_url(value)

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            item.strip().rstrip("/")
            for item in self.cors_origins.split(",")
            if item.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
