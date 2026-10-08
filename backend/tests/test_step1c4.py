def _enroll_participant(client, auth_headers, suffix: str):
    application = client.post(
        "/api/public/recruitment/applications",
        json={
            "preferred_name": f"Step 1C.4 Synthetic {suffix}",
            "contact_email": f"step1c4.{suffix}@example.com",
            "recruitment_source": "step1c4 acceptance",
            "consent_to_screen": True,
            "informed_consent_accepted": True, "informed_consent_version": "committee-consent-draft-2026-10-08",
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
            "review_note": "Step 1C.4 account-link validation.",
        },
    )
    assert review.status_code == 200

    selection = client.post(
        f"/api/recruitment/applications/{application_id}/selection",
        headers=auth_headers,
        json={"status": "selected", "note": "Step 1C.4 synthetic selection."},
    )
    assert selection.status_code == 200

    enrollment = client.post(
        f"/api/recruitment/applications/{application_id}/enroll",
        headers=auth_headers,
    )
    assert enrollment.status_code == 201
    return enrollment.json()


def test_step1c4_participant_account_link_and_self_service_rbac(
    client, auth_headers, participant_headers
):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["version"] in {"0.6.0-step1c5", "0.7.0-step1d1", "0.9.0-privacy-consent"}

    # The seeded demo participant login remains safely unlinked until an
    # authorized study operator explicitly links it.
    unlinked_self = client.get("/api/participant/me", headers=participant_headers)
    assert unlinked_self.status_code == 404

    participant = _enroll_participant(client, auth_headers, "primary")
    allocation = client.post(
        f"/api/participants/{participant['id']}/allocate",
        headers=auth_headers,
    )
    assert allocation.status_code == 201

    account_payload = {
        "initial_password": "Step1C4Portal123!",
    }
    linked = client.post(
        f"/api/participants/{participant['id']}/account",
        headers=auth_headers,
        json=account_payload,
    )
    assert linked.status_code == 201
    link = linked.json()
    assert link["participant_id"] == participant["id"]
    assert link["participant_code"] == participant["participant_code"]
    assert link["account_status"] == "linked"
    assert link["created_account"] is True

    # A retry with the same participant/account is idempotent and cannot rotate
    # credentials or create another audit event.
    retry = client.post(
        f"/api/participants/{participant['id']}/account",
        headers=auth_headers,
        json=account_payload,
    )
    assert retry.status_code == 200
    assert "user_id" not in retry.json() and "user_id" not in link
    assert retry.json()["created_account"] is False

    different_account = client.post(
        f"/api/participants/{participant['id']}/account",
        headers=auth_headers,
        json={
            "email": "step1c4.other@example.com",
            "full_name": "Other Participant",
            "initial_password": "Step1C4Other123!",
        },
    )
    assert different_account.status_code == 422

    login = client.post(
        "/api/auth/login",
        json={
            "email": "step1c4.primary@example.com",
            "password": account_payload["initial_password"],
        },
    )
    assert login.status_code == 200
    assert login.json()["user"]["roles"] == ["PARTICIPANT"]
    linked_headers = {
        "Authorization": f"Bearer {login.json()['access_token']}"
    }

    own_record = client.get("/api/participant/me", headers=linked_headers)
    assert own_record.status_code == 200
    own = own_record.json()
    assert own == {
        "participant_id": participant["id"],
        "participant_code": participant["participant_code"],
        "site_id": participant["site_id"],
        "lifecycle_status": "enrolled",
        "allocation_status": "allocated",
        "assigned_condition": allocation.json()["study_group"],
        "enrolled_at": participant["enrolled_at"],
        "account_status": "linked",
    }
    for forbidden_field in {
        "application_id",
        "user_id",
        "enrolled_by_id",
        "allocation_basis",
        "allocated_by_id",
        "algorithm_version",
        "method",
    }:
        assert forbidden_field not in own

    # The participant can obtain only the linked self record. Staff list,
    # arbitrary detail, allocation trace, account linking and audit remain 403.
    assert client.get("/api/participants", headers=linked_headers).status_code == 403
    assert client.get(
        f"/api/participants/{participant['id']}", headers=linked_headers
    ).status_code == 403
    assert client.get(
        f"/api/participants/{participant['id']}/allocation", headers=linked_headers
    ).status_code == 403
    assert client.post(
        f"/api/participants/{participant['id']}/account",
        headers=linked_headers,
        json=account_payload,
    ).status_code == 403
    assert client.get("/api/recruitment/applications", headers=linked_headers).status_code == 403
    assert client.get("/api/projects", headers=linked_headers).status_code == 403
    assert client.get("/api/admin/audit", headers=linked_headers).status_code == 403

    second = _enroll_participant(client, auth_headers, "secondary")
    # Caller-controlled email/name links are rejected at the input boundary.
    for email in ["step1c4.primary@example.com", "admin@test.example.com"]:
        assert client.post(f"/api/participants/{second['id']}/account", headers=auth_headers,
            json={"email": email, "full_name": "Forbidden join"}).status_code == 422

    audit = client.get("/api/admin/audit?limit=1000", headers=auth_headers)
    assert audit.status_code == 200
    account_events = [
        row
        for row in audit.json()
        if row["action"] == "participant.account_linked"
        and row["entity_id"] == participant["id"]
    ]
    assert len(account_events) == 1
    assert "user_id" not in account_events[0]["details"]
    assert "email" not in account_events[0]["details"]

