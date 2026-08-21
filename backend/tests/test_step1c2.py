from sqlalchemy import select

from app.core.roles import RESEARCH_ASSISTANT
from app.core.security import create_access_token, hash_password
from app.db.session import SessionLocal
from app.models import Role, User

import itertools

import app.api.participants as participant_module


_counter = itertools.count(1)


def _enroll(client, auth_headers):
    n = next(_counter)
    application = client.post(
        "/api/public/recruitment/applications",
        json={
            "preferred_name": f"Step 1C.2 Synthetic {n}",
            "contact_email": f"step1c2.{n}@example.com",
            "recruitment_source": "step1c2 acceptance",
            "consent_to_screen": True,
            "privacy_acknowledged": True,
            "screening_answers": {
                "demo_online_access": True,
                "demo_schedule_availability": True,
                "demo_instruction_language": True,
            },
        },
    )
    assert application.status_code == 201
    application_id = application.json()["id"]

    eligible = client.patch(
        f"/api/recruitment/applications/{application_id}/review",
        headers=auth_headers,
        json={"status": "eligible", "review_note": "Step 1C.2 synthetic eligible"},
    )
    assert eligible.status_code == 200

    selected = client.post(
        f"/api/recruitment/applications/{application_id}/selection",
        headers=auth_headers,
        json={"status": "selected", "note": "Step 1C.2 synthetic selected"},
    )
    assert selected.status_code == 200

    enrolled = client.post(
        f"/api/recruitment/applications/{application_id}/enroll",
        headers=auth_headers,
    )
    assert enrolled.status_code == 201
    return enrolled.json()


def test_step1c2_balanced_server_allocation_idempotency_rbac_and_audit(
    client, auth_headers, participant_headers
):
    participants = [_enroll(client, auth_headers) for _ in range(3)]

    denied = client.post(
        f"/api/participants/{participants[0]['id']}/allocate",
        headers=participant_headers,
    )
    assert denied.status_code == 403

    # Recruitment assistants can manage the participant workflow but cannot
    # trigger protocol-sensitive group allocation.
    with SessionLocal() as db:
        role = db.scalar(select(Role).where(Role.name == RESEARCH_ASSISTANT))
        assistant = db.scalar(select(User).where(User.email == "assistant@test.example.com"))
        if assistant is None:
            assistant = User(
                email="assistant@test.example.com",
                full_name="Test Research Assistant",
                password_hash=hash_password("AssistantTest123!"),
                is_active=True,
            )
            assistant.roles.append(role)
            db.add(assistant)
            db.commit()
            db.refresh(assistant)
        assistant_token = create_access_token(assistant.id)
    assistant_headers = {"Authorization": f"Bearer {assistant_token}"}
    assistant_can_read = client.get("/api/participants", headers=assistant_headers)
    assert assistant_can_read.status_code == 200
    assistant_denied = client.post(
        f"/api/participants/{participants[0]['id']}/allocate",
        headers=assistant_headers,
    )
    assert assistant_denied.status_code == 403

    allocations = []
    for participant in participants:
        response = client.post(
            f"/api/participants/{participant['id']}/allocate",
            headers=auth_headers,
        )
        assert response.status_code == 201
        body = response.json()
        assert body["participant_id"] == participant["id"]
        assert body["study_group"] in {"HumorBot", "STARCASM", "Control"}
        assert body["method"] == "balanced_random"
        assert body["algorithm_version"] == "balanced_random_v1"
        assert body["allocation_basis"]["protocol_finalized"] is False
        tie_candidates = body["allocation_basis"]["tie_candidates"]
        draw = int(body["allocation_basis"]["random_draw_hex"], 16)
        assert body["allocation_basis"]["tie_index"] == draw % len(tie_candidates)
        assert body["study_group"] == tie_candidates[body["allocation_basis"]["tie_index"]]
        allocations.append(body)

    # With minimum-count balancing, the first three allocations must result in
    # one participant per arm regardless of randomized tie-break order.
    assert {row["study_group"] for row in allocations} == {
        "HumorBot", "STARCASM", "Control"
    }

    retry = client.post(
        f"/api/participants/{participants[0]['id']}/allocate",
        headers=auth_headers,
    )
    assert retry.status_code == 200
    assert retry.json()["id"] == allocations[0]["id"]
    assert retry.json()["study_group"] == allocations[0]["study_group"]

    refreshed = client.get(
        f"/api/participants/{participants[0]['id']}", headers=auth_headers
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["allocation_status"] == "allocated"
    assert refreshed.json()["study_group"] == allocations[0]["study_group"]

    summary = client.get("/api/participants/allocation-summary", headers=auth_headers)
    assert summary.status_code == 200
    summary_body = summary.json()
    assert summary_body["groups"]["HumorBot"] >= 1
    assert summary_body["groups"]["STARCASM"] >= 1
    assert summary_body["groups"]["Control"] >= 1
    assert summary_body["protocol_finalized"] is False

    metrics = client.get("/api/participants/metrics", headers=auth_headers)
    assert metrics.status_code == 200
    metrics_body = metrics.json()
    assert metrics_body["humorbot"] >= 1
    assert metrics_body["starcasm"] >= 1
    assert metrics_body["control"] >= 1

    audit = client.get("/api/admin/audit?limit=200", headers=auth_headers)
    assert audit.status_code == 200
    events = [row for row in audit.json() if row["action"] == "participant.allocated"]
    allocated_ids = {row["entity_id"] for row in events}
    assert {p["id"] for p in participants}.issubset(allocated_ids)
    # Idempotent retry must not add a second allocation audit for the participant.
    first_events = [row for row in events if row["entity_id"] == participants[0]["id"]]
    assert len(first_events) == 1


def test_step1c2_enforces_group_capacity(client, auth_headers, monkeypatch):
    # Fill one place in each arm inside this test so the capacity assertion does
    # not depend on another test having run first.
    for _ in range(3):
        enrolled = _enroll(client, auth_headers)
        allocated = client.post(
            f"/api/participants/{enrolled['id']}/allocate",
            headers=auth_headers,
        )
        assert allocated.status_code == 201

    # Reduce the per-arm cap after every group has at least one allocation. A new
    # participant must now be rejected because no group has remaining capacity.
    monkeypatch.setattr(participant_module, "TARGET_PER_GROUP", 1)
    participant = _enroll(client, auth_headers)
    response = client.post(
        f"/api/participants/{participant['id']}/allocate",
        headers=auth_headers,
    )
    assert response.status_code == 409
    assert "capacity is full" in response.json()["detail"]
