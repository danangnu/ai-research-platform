import hashlib
import uuid

from app.core.config import settings
from app.db.session import SessionLocal
from app.models import RecruitmentApplication


def submit(client, **overrides):
    payload = dict(preferred_name="Fictional Applicant", contact_email=f"demo.{uuid.uuid4().hex}@example.com",
                   consent_to_screen=True, privacy_acknowledged=True, informed_consent_accepted=True, informed_consent_version="committee-consent-draft-2026-10-08",
                   screening_answers={"demo_online_access": True, "demo_instruction_language": False, "demo_schedule_availability": True})
    payload.update(overrides)
    return client.post("/api/public/recruitment/applications", json=payload)


def key(receipt):
    return {"reference_code": receipt["reference_code"], "access_token": receipt["access_token"]}


def test_receipt_privacy_and_wrong_credentials(client, auth_headers):
    response = submit(client)
    assert response.status_code == 201
    assert response.headers["cache-control"] == "no-store"
    first, second = response.json(), submit(client).json()
    assert len(first["access_token"]) >= 32
    with SessionLocal() as db:
        row = db.get(RecruitmentApplication, first["id"])
        assert row.access_token_hash == hashlib.sha256(first["access_token"].encode()).hexdigest()
        assert row.access_token_hash != first["access_token"]
    status = client.post("/api/public/recruitment/status", json=key(first))
    assert status.status_code == 200
    assert status.headers["cache-control"] == "no-store"
    assert set(status.json()) == {"reference_code", "status", "stage", "submitted_at", "updated_at", "next_step", "can_withdraw"}
    assert status.json()["stage"] == "submitted"
    wrong = client.post("/api/public/recruitment/status", json={**key(first), "access_token": second["access_token"]})
    missing = client.post("/api/public/recruitment/status", json={**key(first), "reference_code": "APP-UNKNOWN"})
    assert wrong.status_code == missing.status_code == 404
    assert wrong.json() == missing.json()
    assert client.post("/api/public/recruitment/status", json={"reference_code": first["reference_code"]}).status_code == 422
    staff = client.get(f"/api/recruitment/applications/{first['id']}", headers=auth_headers).json()
    assert "access_token" not in staff and "access_token_hash" not in staff
    logs = client.get("/api/admin/audit?limit=200", headers=auth_headers).text
    assert first["access_token"] not in logs
    assert first["contact_email"] not in logs


def test_withdrawal_idempotent_locked_and_reapplication(client, auth_headers):
    app = submit(client).json()
    uri = f"/api/recruitment/applications/{app['id']}"
    client.patch(uri + "/review", headers=auth_headers, json={"status": "eligible", "review_note": "Synthetic only"})
    client.post(uri + "/selection", headers=auth_headers, json={"status": "selected"})
    assert client.post("/api/public/recruitment/status", json=key(app)).json()["stage"] == "selected"
    for _ in range(2):
        response = client.post("/api/public/recruitment/withdraw", json=key(app))
        assert response.status_code == 200
        assert response.json()["stage"] == "withdrawn"
        assert response.json()["can_withdraw"] is False
    assert client.post(uri + "/enroll", headers=auth_headers).status_code == 409
    assert client.post(uri + "/selection", headers=auth_headers, json={"status": "selected"}).status_code == 409
    assert client.patch(uri + "/review", headers=auth_headers, json={"status": "eligible"}).status_code == 409
    events = client.get("/api/admin/audit?limit=200", headers=auth_headers).json()
    assert len([e for e in events if e["action"] == "recruitment.application_withdrawn"]) == 1
    metrics = client.get("/api/recruitment/metrics", headers=auth_headers).json()
    assert metrics["withdrawn"] >= 1
    with SessionLocal() as db:
        email = db.get(RecruitmentApplication, app["id"]).contact_email
    reapplied = submit(client, contact_email=email).json()
    assert reapplied["id"] != app["id"]
    assert client.post("/api/public/recruitment/status", json=key(app)).json()["stage"] == "withdrawn"


def test_status_through_enrollment_and_fresh_login(client, auth_headers, participant_headers):
    app = submit(client).json()
    uri = f"/api/recruitment/applications/{app['id']}"
    assert client.get("/api/recruitment/applications", headers=participant_headers).status_code == 403
    for stage in ("under_review", "needs_review", "eligible"):
        assert client.patch(uri + "/review", headers=auth_headers, json={"status": stage}).status_code == 200
        assert client.post("/api/public/recruitment/status", json=key(app)).json()["stage"] == stage
    for selection in ("waitlisted", "not_selected", "selected"):
        assert client.post(uri + "/selection", headers=auth_headers, json={"status": selection}).status_code == 200
        assert client.post("/api/public/recruitment/status", json=key(app)).json()["stage"] == selection
    participant = client.post(uri + "/enroll", headers=auth_headers).json()
    assert client.post("/api/public/recruitment/status", json=key(app)).json()["stage"] == "enrolled"
    assert client.post("/api/public/recruitment/withdraw", json=key(app)).status_code == 409
    with SessionLocal() as db:
        email = db.get(RecruitmentApplication, app["id"]).contact_email
    link = client.post(f"/api/participants/{participant['id']}/account", headers=auth_headers,
                       json={"initial_password": "SyntheticDemo123!"})
    assert link.status_code in (200, 201), link.text
    assert client.post("/api/public/recruitment/status", json=key(app)).json()["stage"] == "account_linked"
    login = client.post("/api/auth/login", json={"email": email, "password": "SyntheticDemo123!"})
    own = client.get("/api/participant/me", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert own.json()["participant_code"] == participant["participant_code"]


def test_closed_and_non_demo_intake(client, monkeypatch):
    monkeypatch.setattr(settings, "recruitment_open", False)
    assert submit(client).status_code == 503
    assert client.get("/api/public/recruitment/info").json()["recruitment_open"] is False
    monkeypatch.setattr(settings, "recruitment_open", True)
    monkeypatch.setattr(settings, "demo_mode", False)
    assert submit(client).status_code == 503
    assert client.get("/api/public/recruitment/info").json()["recruitment_open"] is False


def test_legacy_status_and_no_consent(client, auth_headers):
    assert submit(client, consent_to_screen=False).status_code == 422
    assert submit(client, preferred_name="  ").status_code == 422
    app = submit(client).json()
    with SessionLocal() as db:
        row = db.get(RecruitmentApplication, app["id"])
        row.access_token_hash = None
        db.commit()
    assert client.post("/api/public/recruitment/status", json=key(app)).status_code == 404
    assert client.get(f"/api/recruitment/applications/{app['id']}", headers=auth_headers).status_code == 200
