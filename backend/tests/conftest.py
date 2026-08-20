import os

os.environ["DATABASE_URL"] = "sqlite:///./test_step1a.db"
os.environ["JWT_SECRET"] = "test-secret-value-only-32-bytes-minimum-2026"
os.environ["ADMIN_EMAIL"] = "admin@test.example.com"
os.environ["ADMIN_PASSWORD"] = "StrongTest123!"
os.environ["ADMIN_FULL_NAME"] = "Test Administrator"

import pytest
from fastapi.testclient import TestClient

from app.db.base import Base
from app.db.session import engine
from app.main import app


@pytest.fixture(scope="session", autouse=True)
def database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

    try:
        os.remove("./test_step1a.db")
    except FileNotFoundError:
        pass


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def admin_token(client):
    response = client.post(
        "/api/auth/login",
        json={
            "email": "admin@test.example.com",
            "password": "StrongTest123!",
        },
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.fixture()
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
