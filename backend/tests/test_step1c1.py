def _submit(client, email: str):
    response = client.post(
        "/api/public/recruitment/applications",
        json={
            "preferred_name": "Synthetic Step 1C Applicant",
            "contact_email": email,
            "recruitment_source": "step1c1 acceptance",
            "consent_to_screen": True,
            "privacy_acknowledged": True,
            "screening_answers": {
                "demo_online_access": True,
                "demo_schedule_availability": True,
                "demo_instruction_language": True,
            },
        },
    )
    assert response.status_code == 201
    return response.json()


def _make_eligible(client, auth_headers, application_id: str):
    response = client.patch(
        f"/api/recruitment/applications/{application_id}/review",
        headers=auth_headers,
        json={
            "status": "eligible",
            "review_note": "Synthetic Step 1C.1 eligibility workflow validation.",
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "eligible"


def test_step1c1_selection_enrollment_persistence_rbac_and_audit(
    client, auth_headers, participant_headers
):
    application = _submit(client, "step1c1.selected@example.com")
    application_id = application["id"]
    _make_eligible(client, auth_headers, application_id)

    denied_selection = client.post(
        f"/api/recruitment/applications/{application_id}/selection",
        headers=participant_headers,
        json={"status": "selected", "note": "must be denied"},
    )
    assert denied_selection.status_code == 403

    selection = client.post(
        f"/api/recruitment/applications/{application_id}/selection",
        headers=auth_headers,
        json={
            "status": "selected",
            "note": "Synthetic Step 1C.1 selection validation only.",
        },
    )
    assert selection.status_code == 200
    selection_body = selection.json()
    assert selection_body["application_id"] == application_id
    assert selection_body["status"] == "selected"

    persisted_selections = client.get(
        "/api/recruitment/selections", headers=auth_headers
    )
    assert persisted_selections.status_code == 200
    assert any(
        row["application_id"] == application_id and row["status"] == "selected"
        for row in persisted_selections.json()
    )

    denied_enrollment = client.post(
        f"/api/recruitment/applications/{application_id}/enroll",
        headers=participant_headers,
    )
    assert denied_enrollment.status_code == 403

    enrollment = client.post(
        f"/api/recruitment/applications/{application_id}/enroll",
        headers=auth_headers,
    )
    assert enrollment.status_code == 201
    participant = enrollment.json()
    assert participant["participant_code"].startswith("P-")
    assert participant["lifecycle_status"] == "enrolled"
    assert participant["allocation_status"] == "not_allocated"
    assert participant["study_group"] is None
    assert participant["application_id"] == application_id
    assert "preferred_name" not in participant
    assert "contact_email" not in participant

    # POST is deliberately idempotent so a browser/network retry cannot create
    # a second participant for the same recruitment application.
    retry = client.post(
        f"/api/recruitment/applications/{application_id}/enroll",
        headers=auth_headers,
    )
    assert retry.status_code == 200
    assert retry.json()["id"] == participant["id"]
    assert retry.json()["participant_code"] == participant["participant_code"]

    locked_selection = client.post(
        f"/api/recruitment/applications/{application_id}/selection",
        headers=auth_headers,
        json={"status": "waitlisted", "note": "must remain locked"},
    )
    assert locked_selection.status_code == 409

    locked_eligibility = client.patch(
        f"/api/recruitment/applications/{application_id}/review",
        headers=auth_headers,
        json={"status": "ineligible", "review_note": "must remain locked"},
    )
    assert locked_eligibility.status_code == 409

    participant_list = client.get("/api/participants", headers=auth_headers)
    assert participant_list.status_code == 200
    matching = [
        row for row in participant_list.json() if row["application_id"] == application_id
    ]
    assert len(matching) == 1

    denied_list = client.get("/api/participants", headers=participant_headers)
    assert denied_list.status_code == 403

    metrics = client.get("/api/participants/metrics", headers=auth_headers)
    assert metrics.status_code == 200
    assert metrics.json()["participants"] >= 1
    assert metrics.json()["enrolled"] >= 1
    assert metrics.json()["not_allocated"] >= 1
    assert metrics.json()["allocated"] == 0

    audit = client.get("/api/admin/audit?limit=100", headers=auth_headers)
    assert audit.status_code == 200
    relevant = [
        row for row in audit.json()
        if row["action"] in {"participant.selection_recorded", "participant.enrolled"}
    ]
    actions = {row["action"] for row in relevant}
    assert "participant.selection_recorded" in actions
    assert "participant.enrolled" in actions
    enrollment_events = [
        row for row in relevant
        if row["action"] == "participant.enrolled"
        and row["entity_id"] == participant["id"]
    ]
    assert len(enrollment_events) == 1


def test_step1c1_requires_eligibility_and_selected_status(client, auth_headers):
    application = _submit(client, "step1c1.guard@example.com")
    application_id = application["id"]

    premature_selection = client.post(
        f"/api/recruitment/applications/{application_id}/selection",
        headers=auth_headers,
        json={"status": "selected", "note": "too early"},
    )
    assert premature_selection.status_code == 409

    _make_eligible(client, auth_headers, application_id)

    waitlist = client.post(
        f"/api/recruitment/applications/{application_id}/selection",
        headers=auth_headers,
        json={"status": "waitlisted", "note": "synthetic waitlist"},
    )
    assert waitlist.status_code == 200

    blocked_enrollment = client.post(
        f"/api/recruitment/applications/{application_id}/enroll",
        headers=auth_headers,
    )
    assert blocked_enrollment.status_code == 409

    select = client.post(
        f"/api/recruitment/applications/{application_id}/selection",
        headers=auth_headers,
        json={"status": "selected", "note": "synthetic selected"},
    )
    assert select.status_code == 200

    enrollment = client.post(
        f"/api/recruitment/applications/{application_id}/enroll",
        headers=auth_headers,
    )
    assert enrollment.status_code == 201
    assert enrollment.json()["study_group"] is None
