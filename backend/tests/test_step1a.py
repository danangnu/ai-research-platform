def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_invalid_login(client):
    response = client.post(
        "/api/auth/login",
        json={
            "email": "admin@test.example.com",
            "password": "incorrect",
        },
    )
    assert response.status_code == 401


def test_me(client, auth_headers):
    response = client.get(
        "/api/auth/me",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert "PROJECT_ADMIN" in response.json()["roles"]


def test_project_management_and_audit(client, auth_headers):
    project = client.post(
        "/api/projects",
        headers=auth_headers,
        json={
            "code": "AIRS-600",
            "name": "AI Humor & Sarcasm Research Study",
            "description": "600 participant study management project.",
            "status": "planning",
        },
    )
    assert project.status_code == 201
    project_id = project.json()["id"]

    milestone = client.post(
        f"/api/projects/{project_id}/milestones",
        headers=auth_headers,
        json={
            "code": "M1",
            "name": "Study & Recruitment Design",
            "status": "in_progress",
        },
    )
    assert milestone.status_code == 201
    milestone_id = milestone.json()["id"]

    task = client.post(
        f"/api/projects/{project_id}/tasks",
        headers=auth_headers,
        json={
            "milestone_id": milestone_id,
            "title": "Finalize recruiting matrix",
            "priority": "high",
            "status": "in_progress",
        },
    )
    assert task.status_code == 201
    task_id = task.json()["id"]

    update = client.patch(
        f"/api/projects/{project_id}/tasks/{task_id}",
        headers=auth_headers,
        json={
            "status": "completed",
            "note": "Matrix reviewed for Step 1A acceptance test.",
        },
    )
    assert update.status_code == 200
    assert update.json()["status"] == "completed"

    risk = client.post(
        f"/api/projects/{project_id}/risks",
        headers=auth_headers,
        json={
            "title": "Ethics approval delay",
            "level": "high",
            "mitigation": "Treat approval as an external recruitment gate.",
        },
    )
    assert risk.status_code == 201

    site = client.post(
        "/api/admin/study-sites",
        headers=auth_headers,
        json={
            "code": "SITE-01",
            "name": "Pilot Research Site",
        },
    )
    assert site.status_code == 201

    audit = client.get(
        "/api/admin/audit?limit=100",
        headers=auth_headers,
    )
    assert audit.status_code == 200

    actions = {row["action"] for row in audit.json()}
    assert "project.created" in actions
    assert "milestone.created" in actions
    assert "task.created" in actions
    assert "task.updated" in actions
    assert "risk.created" in actions
    assert "study_site.created" in actions


def test_unauthenticated_admin_is_rejected(client):
    response = client.get("/api/admin/audit")
    assert response.status_code == 401
