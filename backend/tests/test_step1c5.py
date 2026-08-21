def _login(client, email: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_step1c5_consolidated_lifecycle_audit_persistence_counts_and_rbac(
    client, auth_headers
):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["version"] in {"0.6.0-step1c5", "0.7.0-step1d1"}

    before_participants = client.get("/api/participants", headers=auth_headers).json()
    before_metrics = client.get("/api/participants/metrics", headers=auth_headers).json()
    before_summary = client.get(
        "/api/participants/allocation-summary", headers=auth_headers
    ).json()
    before_applications = client.get(
        "/api/recruitment/applications", headers=auth_headers
    ).json()

    assert before_metrics["participants"] == len(before_participants)
    assert before_metrics["linked_accounts"] == sum(
        row["user_id"] is not None for row in before_participants
    )
    assert before_summary["allocated"] == sum(before_summary["groups"].values())

    application_response = client.post(
        "/api/public/recruitment/applications",
        json={
            "preferred_name": "Step 1C.5 Synthetic Participant",
            "contact_email": "step1c5.acceptance@example.com",
            "recruitment_source": "step1c5 consolidated acceptance",
            "consent_to_screen": True,
            "privacy_acknowledged": True,
            "screening_answers": {
                "demo_online_access": True,
                "demo_schedule_availability": True,
                "demo_instruction_language": True,
            },
        },
    )
    assert application_response.status_code == 201
    application = application_response.json()

    review = client.patch(
        f"/api/recruitment/applications/{application['id']}/review",
        headers=auth_headers,
        json={
            "status": "eligible",
            "review_note": "Step 1C.5 synthetic eligibility decision.",
        },
    )
    assert review.status_code == 200

    selection = client.post(
        f"/api/recruitment/applications/{application['id']}/selection",
        headers=auth_headers,
        json={"status": "selected", "note": "Step 1C.5 synthetic selection."},
    )
    assert selection.status_code == 200

    enrollment = client.post(
        f"/api/recruitment/applications/{application['id']}/enroll",
        headers=auth_headers,
    )
    assert enrollment.status_code == 201
    participant = enrollment.json()

    enrollment_retry = client.post(
        f"/api/recruitment/applications/{application['id']}/enroll",
        headers=auth_headers,
    )
    assert enrollment_retry.status_code == 200
    assert enrollment_retry.json()["id"] == participant["id"]
    assert enrollment_retry.json()["participant_code"] == participant["participant_code"]

    locked_selection = client.post(
        f"/api/recruitment/applications/{application['id']}/selection",
        headers=auth_headers,
        json={"status": "waitlisted", "note": "Must remain locked."},
    )
    assert locked_selection.status_code == 409
    locked_eligibility = client.patch(
        f"/api/recruitment/applications/{application['id']}/review",
        headers=auth_headers,
        json={"status": "ineligible", "review_note": "Must remain locked."},
    )
    assert locked_eligibility.status_code == 409

    allocation_response = client.post(
        f"/api/participants/{participant['id']}/allocate",
        headers=auth_headers,
    )
    assert allocation_response.status_code == 201
    allocation = allocation_response.json()
    assert allocation["allocation_basis"]["counts_before"] == before_summary["groups"]
    assert allocation["allocation_basis"]["protocol_finalized"] is False
    assert allocation["study_group"] in allocation["allocation_basis"]["tie_candidates"]

    allocation_retry = client.post(
        f"/api/participants/{participant['id']}/allocate",
        headers=auth_headers,
    )
    assert allocation_retry.status_code == 200
    assert allocation_retry.json()["id"] == allocation["id"]
    assert allocation_retry.json()["study_group"] == allocation["study_group"]

    account_payload = {
        "email": "step1c5.portal@example.com",
        "full_name": "Step 1C.5 Portal Participant",
        "initial_password": "Step1C5Portal123!",
    }
    account_response = client.post(
        f"/api/participants/{participant['id']}/account",
        headers=auth_headers,
        json=account_payload,
    )
    assert account_response.status_code == 201
    account_link = account_response.json()

    account_retry = client.post(
        f"/api/participants/{participant['id']}/account",
        headers=auth_headers,
        json=account_payload,
    )
    assert account_retry.status_code == 200
    assert account_retry.json()["user_id"] == account_link["user_id"]

    account_conflict = client.post(
        f"/api/participants/{participant['id']}/account",
        headers=auth_headers,
        json={
            "email": "step1c5.conflict@example.com",
            "full_name": "Conflicting Participant",
            "initial_password": "Step1C5Conflict123!",
        },
    )
    assert account_conflict.status_code == 409

    participant_headers = _login(
        client, account_payload["email"], account_payload["initial_password"]
    )
    participant_self = client.get(
        "/api/participant/me", headers=participant_headers
    )
    assert participant_self.status_code == 200
    assert participant_self.json()["participant_id"] == participant["id"]
    assert participant_self.json()["assigned_condition"] == allocation["study_group"]

    # A fresh administrator login and complete re-read simulate a browser/API
    # refresh and prove that every lifecycle record is persisted, not UI state.
    refreshed_admin_headers = _login(
        client, "admin@test.example.com", "StrongTest123!"
    )
    refreshed_list = client.get(
        "/api/participants", headers=refreshed_admin_headers
    )
    refreshed_detail = client.get(
        f"/api/participants/{participant['id']}", headers=refreshed_admin_headers
    )
    refreshed_allocation = client.get(
        f"/api/participants/{participant['id']}/allocation",
        headers=refreshed_admin_headers,
    )
    refreshed_trail = client.get(
        f"/api/participants/{participant['id']}/audit-trail",
        headers=refreshed_admin_headers,
    )
    assert refreshed_list.status_code == 200
    assert refreshed_detail.status_code == 200
    assert refreshed_allocation.status_code == 200
    assert refreshed_trail.status_code == 200

    matching = [row for row in refreshed_list.json() if row["id"] == participant["id"]]
    assert len(matching) == 1
    persisted = matching[0]
    assert persisted["participant_code"] == participant["participant_code"]
    assert persisted["application_id"] == application["id"]
    assert persisted["allocation_status"] == "allocated"
    assert persisted["study_group"] == allocation["study_group"]
    assert persisted["user_id"] == account_link["user_id"]
    assert refreshed_detail.json() == persisted
    assert refreshed_allocation.json()["id"] == allocation["id"]

    trail = refreshed_trail.json()
    assert trail["participant_id"] == participant["id"]
    assert trail["participant_code"] == participant["participant_code"]
    assert trail["application_id"] == application["id"]
    expected_actions = {
        "recruitment.application_submitted",
        "recruitment.application_reviewed",
        "participant.selection_recorded",
        "participant.enrolled",
        "participant.allocated",
        "participant.account_linked",
    }
    actions = [event["action"] for event in trail["events"]]
    assert set(actions) == expected_actions
    assert len(actions) == len(expected_actions)
    assert len({event["id"] for event in trail["events"]}) == len(expected_actions)
    assert [event["created_at"] for event in trail["events"]] == sorted(
        event["created_at"] for event in trail["events"]
    )
    assert all("ip_address" not in event for event in trail["events"])

    allocation_event = next(
        event for event in trail["events"] if event["action"] == "participant.allocated"
    )
    assert allocation_event["details"]["study_group"] == allocation["study_group"]
    assert allocation_event["details"]["algorithm_version"] == "balanced_random_v1"
    account_event = next(
        event
        for event in trail["events"]
        if event["action"] == "participant.account_linked"
    )
    assert account_event["details"]["user_id"] == account_link["user_id"]
    assert "email" not in account_event["details"]

    after_metrics = client.get(
        "/api/participants/metrics", headers=refreshed_admin_headers
    ).json()
    after_summary = client.get(
        "/api/participants/allocation-summary", headers=refreshed_admin_headers
    ).json()
    after_applications = client.get(
        "/api/recruitment/applications", headers=refreshed_admin_headers
    ).json()
    after_recruitment_metrics = client.get(
        "/api/recruitment/metrics", headers=refreshed_admin_headers
    ).json()

    assert after_metrics["participants"] == before_metrics["participants"] + 1
    assert after_metrics["enrolled"] == before_metrics["enrolled"] + 1
    assert after_metrics["allocated"] == before_metrics["allocated"] + 1
    assert after_metrics["linked_accounts"] == before_metrics["linked_accounts"] + 1
    assert after_metrics["not_allocated"] == before_metrics["not_allocated"]
    assert after_metrics["remaining_target"] == max(
        600 - after_metrics["participants"], 0
    )
    assert after_recruitment_metrics["applications"] == len(after_applications)
    assert len(after_applications) == len(before_applications) + 1

    refreshed_rows = refreshed_list.json()
    assert after_metrics["participants"] == len(refreshed_rows)
    assert after_metrics["enrolled"] == sum(
        row["lifecycle_status"] == "enrolled" for row in refreshed_rows
    )
    assert after_metrics["allocated"] == sum(
        row["allocation_status"] == "allocated" for row in refreshed_rows
    )
    assert after_metrics["linked_accounts"] == sum(
        row["user_id"] is not None for row in refreshed_rows
    )
    group_metric_keys = {
        "HumorBot": "humorbot",
        "STARCASM": "starcasm",
        "Control": "control",
    }
    for group, metric_key in group_metric_keys.items():
        expected_count = sum(row["study_group"] == group for row in refreshed_rows)
        assert after_metrics[metric_key] == expected_count
        assert after_summary["groups"][group] == expected_count

    assert after_summary["allocated"] == sum(after_summary["groups"].values())
    assert after_summary["allocated"] == after_metrics["allocated"]
    assert after_summary["not_allocated"] == after_metrics["not_allocated"]
    assert after_summary["remaining_capacity"] == max(
        600 - after_summary["allocated"], 0
    )
    assert after_summary["protocol_finalized"] is False

    # Participant sessions remain self-only across every consolidated endpoint.
    assert client.get(
        f"/api/participants/{participant['id']}/audit-trail",
        headers=participant_headers,
    ).status_code == 403
    assert client.get("/api/participants/metrics", headers=participant_headers).status_code == 403
    assert client.get(
        "/api/participants/allocation-summary", headers=participant_headers
    ).status_code == 403
    assert client.get("/api/admin/audit", headers=participant_headers).status_code == 403
    assert client.get(
        "/api/recruitment/applications", headers=participant_headers
    ).status_code == 403
    assert client.get("/api/projects", headers=participant_headers).status_code == 403

    refreshed_participant_headers = _login(
        client, account_payload["email"], account_payload["initial_password"]
    )
    refreshed_self = client.get(
        "/api/participant/me", headers=refreshed_participant_headers
    )
    assert refreshed_self.status_code == 200
    assert refreshed_self.json() == participant_self.json()
    for forbidden_field in {
        "application_id",
        "user_id",
        "allocation_basis",
        "algorithm_version",
        "actor_user_id",
        "events",
    }:
        assert forbidden_field not in refreshed_self.json()
