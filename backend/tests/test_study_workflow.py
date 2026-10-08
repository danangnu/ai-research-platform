import uuid
from sqlalchemy import select
from app.db.session import SessionLocal
from app.models import User, Role
from app.core.security import create_access_token
from app.core.config import settings
from test_recruitment_demo import submit


def enrolled(client, auth_headers, allocate=True):
    application = submit(client).json()
    uri = f"/api/recruitment/applications/{application['id']}"
    assert client.patch(uri + "/review", headers=auth_headers, json={"status": "eligible"}).status_code == 200
    assert client.post(uri + "/selection", headers=auth_headers, json={"status": "selected"}).status_code == 200
    p = client.post(uri + "/enroll", headers=auth_headers).json()
    with SessionLocal() as db:
        from app.models import RecruitmentApplication
        email = db.get(RecruitmentApplication, application["id"]).contact_email
    linked = client.post(f"/api/participants/{p['id']}/account", headers=auth_headers,
        json={"initial_password": "SyntheticDemo123!"})
    assert linked.status_code in (200, 201), linked.text
    if allocate:
        assert client.post(f"/api/participants/{p['id']}/allocate", headers=auth_headers).status_code in (200, 201)
    login = client.post("/api/auth/login", json={"email": email, "password": "SyntheticDemo123!"}).json()
    return p, {"Authorization": f"Bearer {login['access_token']}"}


def send(client, headers, stage, **fields):
    return client.post(f"/api/study-workflow/me/{stage}", headers=headers,
        json={"version": "synthetic-workflow-v1", "confirmed": True, **fields})


def test_complete_workflow_and_matching(client, auth_headers):
    p, headers = enrolled(client, auth_headers)
    before = client.get("/api/study-workflow/dashboard", headers=auth_headers).json()
    progress = client.get("/api/study-workflow/me", headers=headers)
    assert progress.headers["cache-control"] == "no-store"
    assert progress.json()["next_stage"] == "pre"
    assert "scores" not in progress.json()
    assert all(set(q) == {"prompt", "options"} for q in progress.json()["questions"])
    assert send(client, headers, "post", answers=[0,1,0,0]).status_code == 409
    pre = send(client, headers, "pre", answers=[1,0,1,2])
    assert pre.status_code == 200, pre.text
    assert send(client, headers, "pre", answers=[1,0,1,2]).json()["duplicate"] is True
    assert send(client, headers, "pre", answers=[1,0,1,1]).status_code == 409
    for n in range(1,4):
        result = send(client, headers, f"session-{n}", minutes=5, assistance="none", comfort="tiring" if n == 2 else "comfortable")
        assert result.status_code == 200, result.text
    assert client.get("/api/study-workflow/me", headers=headers).json()["next_stage"] == "post"
    assert send(client, headers, "post", answers=[0,1,0,0]).status_code == 200
    assert client.get("/api/study-workflow/me", headers=headers).json()["next_stage"] == "complete"
    after = client.get("/api/study-workflow/dashboard", headers=auth_headers).json()
    row = next(r for r in after["participants"] if r["participant_id"] == p["id"])
    assert row["scores"]["pre"] == {"correct":3,"skipped":1,"total":4}
    assert row["scores"]["post"]["correct"] == 4
    assert row["session_minutes"] == 15 and row["needs_review"]
    assert after["counts"]["session_records"] == before["counts"]["session_records"] + 3
    assert after["paired"]["n"] == before["paired"]["n"] + 1
    assert "email" not in str(row) and "full_name" not in str(row)


def test_baseline_before_assignment_and_isolation(client, auth_headers, participant_headers):
    p, first = enrolled(client, auth_headers, allocate=False)
    _, second = enrolled(client, auth_headers)
    assert send(client, first, "pre", answers=[2,2,2,2]).status_code == 200
    assert client.get("/api/study-workflow/me", headers=first).json()["next_stage"] == "allocation"
    assert send(client, first, "session-1", minutes=2, assistance="none", comfort="comfortable").status_code == 409
    assert client.get("/api/study-workflow/me", headers=second).json()["completed_stages"] == []
    assert client.get("/api/study-workflow/dashboard", headers=first).status_code == 403
    assert client.get("/api/study-workflow/me", headers=auth_headers).status_code == 403
    with SessionLocal() as db:
        unlinked = User(email=f"unlinked.{uuid.uuid4().hex}@example.com", full_name="Unlinked test", password_hash="not-a-password", is_active=True)
        unlinked.roles = [db.scalar(select(Role).where(Role.name == "PARTICIPANT"))]
        db.add(unlinked)
        db.commit()
        unlinked_headers = {"Authorization": f"Bearer {create_access_token(unlinked.id)}"}
    assert client.get("/api/study-workflow/me", headers=unlinked_headers).status_code == 404
    assert client.get("/api/study-workflow/me").status_code == 401
    assert send(client, second, "pre", participant_id=p["id"], answers=[0,0,0,0]).status_code == 422


def test_validation_and_prototype_gate(client, auth_headers, monkeypatch):
    _, headers = enrolled(client, auth_headers)
    for answers in ([0], [0,1,4,0], [True,0,1,0]):
        assert send(client, headers, "pre", answers=answers).status_code == 422
    assert send(client, headers, "pre", answers=[0,0,0,0], minutes=5).status_code == 422
    assert send(client, headers, "pre", answers=[0,0,0,0], confirmed=False).status_code == 422
    monkeypatch.setattr(settings, "demo_mode", False)
    assert send(client, headers, "pre", answers=[0,0,0,0]).status_code == 403
    assert client.get("/api/study-workflow/dashboard", headers=auth_headers).status_code == 403
