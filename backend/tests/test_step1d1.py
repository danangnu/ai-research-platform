from sqlalchemy import select

from app.core.roles import RESEARCH_ASSISTANT
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Role, User


def _login(client, email: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _complete_protocol(project_id: str, version: str) -> dict:
    return {
        "project_id": project_id,
        "version": version,
        "title": "HumorBot/STARCASM controlled study protocol",
        "objective": "Estimate condition effects across approved task and experience strata.",
        "randomization_unit": "participant",
        "allocation_method": "stratified_permuted_block",
        "target_total": 600,
        "conditions": [
            {"code": "HumorBot", "label": "HumorBot", "target_n": 200},
            {"code": "STARCASM", "label": "STARCASM", "target_n": 200},
            {"code": "Control", "label": "Control", "target_n": 200},
        ],
        "stratification_factors": [
            {
                "key": "experience_band",
                "label": "Professional experience band",
                "source_field": "professional_experience_band",
                "required": True,
                "levels": [
                    {"code": "exp_1_3", "label": "1-3 years"},
                    {"code": "exp_4_7", "label": "4-7 years"},
                    {"code": "exp_8_15", "label": "8-15 years"},
                ],
            }
        ],
        "task_blocks": [
            {"code": "task_a", "label": "Standardized task A"},
            {"code": "task_b", "label": "Standardized task B"},
            {"code": "task_c", "label": "Standardized task C"},
            {"code": "task_d", "label": "Standardized task D"},
        ],
        "permitted_block_sizes": [3, 6],
        "protocol_document_ref": "test://approved-protocol/step1d1",
        "change_summary": "Synthetic Step 1D.1 acceptance configuration.",
    }


def test_step1d1_protocol_validation_approval_immutability_and_rbac(
    client, auth_headers, participant_headers
):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["version"] == "0.9.0-privacy-consent"

    project_response = client.post(
        "/api/projects",
        headers=auth_headers,
        json={
            "code": "STEP1D1-PROTOCOL",
            "name": "Step 1D.1 Protocol Test Project",
            "description": "Synthetic protocol governance acceptance project.",
        },
    )
    assert project_response.status_code == 201
    project = project_response.json()

    with SessionLocal() as db:
        assistant_role = db.scalar(select(Role).where(Role.name == RESEARCH_ASSISTANT))
        assistant = User(
            email="step1d1.assistant@example.com",
            full_name="Step 1D.1 Research Assistant",
            password_hash=hash_password("Step1D1Assistant123!"),
            is_active=True,
        )
        assistant.roles.append(assistant_role)
        db.add(assistant)
        db.commit()
    assistant_headers = _login(
        client, "step1d1.assistant@example.com", "Step1D1Assistant123!"
    )

    incomplete_payload = _complete_protocol(project["id"], "0.9-incomplete")
    incomplete_payload["stratification_factors"][0]["levels"] = []
    incomplete_payload["protocol_document_ref"] = ""
    incomplete = client.post(
        "/api/study/protocols", headers=auth_headers, json=incomplete_payload
    )
    assert incomplete.status_code == 201
    incomplete_validation = client.get(
        f"/api/study/protocols/{incomplete.json()['id']}/validation",
        headers=auth_headers,
    )
    assert incomplete_validation.status_code == 200
    assert incomplete_validation.json()["approval_ready"] is False
    assert incomplete_validation.json()["activation_ready"] is False
    assert incomplete_validation.json()["errors"]
    blocked_approval = client.post(
        f"/api/study/protocols/{incomplete.json()['id']}/approve",
        headers=auth_headers,
    )
    assert blocked_approval.status_code == 409

    create_response = client.post(
        "/api/study/protocols",
        headers=auth_headers,
        json=_complete_protocol(project["id"], "1.0-test"),
    )
    assert create_response.status_code == 201
    protocol = create_response.json()
    assert protocol["status"] == "draft"
    assert protocol["configuration_hash"] is None
    assert protocol["conditions"][0]["target_n"] == 200

    duplicate = client.post(
        "/api/study/protocols",
        headers=auth_headers,
        json=_complete_protocol(project["id"], "1.0-test"),
    )
    assert duplicate.status_code == 409

    validation_before = client.get(
        f"/api/study/protocols/{protocol['id']}/validation",
        headers=auth_headers,
    )
    assert validation_before.status_code == 200
    first_validation = validation_before.json()
    assert first_validation["valid"] is True
    assert first_validation["approval_ready"] is True
    assert first_validation["activation_ready"] is False
    assert len(first_validation["configuration_hash"]) == 64
    assert "Step 1D.2" in first_validation["activation_blocker"]

    update = client.patch(
        f"/api/study/protocols/{protocol['id']}",
        headers=auth_headers,
        json={"change_summary": "Reviewed synthetic protocol configuration."},
    )
    assert update.status_code == 200
    assert update.json()["change_summary"].startswith("Reviewed")
    validation_after = client.get(
        f"/api/study/protocols/{protocol['id']}/validation",
        headers=auth_headers,
    ).json()
    assert validation_after["configuration_hash"] != first_validation["configuration_hash"]

    approval = client.post(
        f"/api/study/protocols/{protocol['id']}/approve", headers=auth_headers
    )
    assert approval.status_code == 200
    approved = approval.json()
    assert approved["status"] == "approved"
    assert approved["configuration_hash"] == validation_after["configuration_hash"]
    assert approved["approved_by_id"]
    assert approved["approved_at"]

    approval_retry = client.post(
        f"/api/study/protocols/{protocol['id']}/approve", headers=auth_headers
    )
    assert approval_retry.status_code == 200
    assert approval_retry.json()["configuration_hash"] == approved["configuration_hash"]

    immutable = client.patch(
        f"/api/study/protocols/{protocol['id']}",
        headers=auth_headers,
        json={"target_total": 603},
    )
    assert immutable.status_code == 409
    activation = client.post(
        f"/api/study/protocols/{protocol['id']}/activate", headers=auth_headers
    )
    assert activation.status_code == 409
    assert "Step 1D.2" in activation.json()["detail"]

    refreshed_headers = _login(client, "admin@test.example.com", "StrongTest123!")
    persisted = client.get(
        f"/api/study/protocols/{protocol['id']}", headers=refreshed_headers
    )
    assert persisted.status_code == 200
    assert persisted.json()["configuration_hash"] == approved["configuration_hash"]
    listing = client.get(
        f"/api/study/protocols?project_id={project['id']}", headers=refreshed_headers
    )
    assert listing.status_code == 200
    assert {row["id"] for row in listing.json()} == {
        protocol["id"],
        incomplete.json()["id"],
    }
    summary = client.get(
        f"/api/study/protocols/summary?project_id={project['id']}",
        headers=refreshed_headers,
    )
    assert summary.status_code == 200
    assert summary.json()["total_versions"] == 2
    assert summary.json()["drafts"] == 1
    assert summary.json()["approved"] == 1
    assert summary.json()["active"] == 0
    assert summary.json()["allocation_engine_connected"] is False

    allocation_summary = client.get(
        "/api/participants/allocation-summary", headers=refreshed_headers
    )
    assert allocation_summary.status_code == 200
    assert allocation_summary.json()["protocol_finalized"] is False
    assert allocation_summary.json()["algorithm_version"] == "balanced_random_v1"

    audit = client.get("/api/admin/audit?limit=100", headers=refreshed_headers)
    assert audit.status_code == 200
    protocol_events = [
        event for event in audit.json() if event["entity_id"] == protocol["id"]
    ]
    assert [event["action"] for event in protocol_events].count("protocol.created") == 1
    assert [event["action"] for event in protocol_events].count("protocol.updated") == 1
    assert [event["action"] for event in protocol_events].count("protocol.approved") == 1
    approval_event = next(
        event for event in protocol_events if event["action"] == "protocol.approved"
    )
    assert approval_event["details"]["configuration_hash"] == approved["configuration_hash"]

    assert client.get("/api/study/protocols", headers=assistant_headers).status_code == 200
    assert client.get(
        f"/api/study/protocols/{protocol['id']}", headers=assistant_headers
    ).status_code == 200
    assert client.post(
        "/api/study/protocols",
        headers=assistant_headers,
        json=_complete_protocol(project["id"], "assistant-denied"),
    ).status_code == 403
    assert client.patch(
        f"/api/study/protocols/{incomplete.json()['id']}",
        headers=assistant_headers,
        json={"change_summary": "Forbidden update"},
    ).status_code == 403
    assert client.post(
        f"/api/study/protocols/{incomplete.json()['id']}/approve",
        headers=assistant_headers,
    ).status_code == 403

    for method, path, body in [
        ("get", "/api/study/protocols", None),
        ("get", "/api/study/protocols/summary", None),
        ("get", f"/api/study/protocols/{protocol['id']}", None),
        ("get", f"/api/study/protocols/{protocol['id']}/validation", None),
        ("post", "/api/study/protocols", _complete_protocol(project["id"], "2.0")),
        ("patch", f"/api/study/protocols/{incomplete.json()['id']}", {"change_summary": "Forbidden"}),
        ("post", f"/api/study/protocols/{protocol['id']}/approve", None),
        ("post", f"/api/study/protocols/{protocol['id']}/activate", None),
    ]:
        if body is None:
            response = getattr(client, method)(path, headers=participant_headers)
        else:
            response = getattr(client, method)(
                path, headers=participant_headers, json=body
            )
        assert response.status_code == 403

