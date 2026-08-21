def _enroll_participant(client, auth_headers):
    application = client.post(
        "/api/public/recruitment/applications",
        json={
            "preferred_name": "Step 1C.3 Synthetic Participant",
            "contact_email": "step1c3.management@example.com",
            "recruitment_source": "step1c3 acceptance",
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

    review = client.patch(
        f"/api/recruitment/applications/{application_id}/review",
        headers=auth_headers,
        json={
            "status": "eligible",
            "review_note": "Step 1C.3 participant-management validation.",
        },
    )
    assert review.status_code == 200

    selection = client.post(
        f"/api/recruitment/applications/{application_id}/selection",
        headers=auth_headers,
        json={
            "status": "selected",
            "note": "Step 1C.3 synthetic selection.",
        },
    )
    assert selection.status_code == 200

    enrollment = client.post(
        f"/api/recruitment/applications/{application_id}/enroll",
        headers=auth_headers,
    )
    assert enrollment.status_code == 201
    return enrollment.json()


def test_step1c3_participant_management_contract_and_rbac(
    client, auth_headers, participant_headers
):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["version"] == "0.5.0-step1c4"

    participant = _enroll_participant(client, auth_headers)
    allocation = client.post(
        f"/api/participants/{participant['id']}/allocate",
        headers=auth_headers,
    )
    assert allocation.status_code == 201

    participant_list = client.get("/api/participants", headers=auth_headers)
    assert participant_list.status_code == 200
    managed = next(
        row for row in participant_list.json() if row["id"] == participant["id"]
    )

    required_fields = {
        "id",
        "participant_code",
        "application_id",
        "site_id",
        "user_id",
        "lifecycle_status",
        "allocation_status",
        "study_group",
        "enrolled_at",
    }
    assert required_fields.issubset(managed)
    assert managed["participant_code"].startswith("P-")
    assert managed["lifecycle_status"] == "enrolled"
    assert managed["allocation_status"] == "allocated"
    assert managed["study_group"] in {"HumorBot", "STARCASM", "Control"}
    assert managed["user_id"] is None
    assert "preferred_name" not in managed
    assert "contact_email" not in managed

    detail = client.get(
        f"/api/participants/{participant['id']}", headers=auth_headers
    )
    assert detail.status_code == 200
    assert detail.json() == managed

    allocation_detail = client.get(
        f"/api/participants/{participant['id']}/allocation",
        headers=auth_headers,
    )
    assert allocation_detail.status_code == 200
    assert allocation_detail.json()["id"] == allocation.json()["id"]

    denied_list = client.get("/api/participants", headers=participant_headers)
    assert denied_list.status_code == 403
    denied_detail = client.get(
        f"/api/participants/{participant['id']}", headers=participant_headers
    )
    assert denied_detail.status_code == 403
    denied_allocation = client.get(
        f"/api/participants/{participant['id']}/allocation",
        headers=participant_headers,
    )
    assert denied_allocation.status_code == 403
