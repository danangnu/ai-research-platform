def test_public_recruitment_info(client):
    response = client.get("/api/public/recruitment/info")
    assert response.status_code == 200
    body = response.json()
    assert body["recruitment_open"] is True
    assert body["target_total"] == 600
    assert body["target_groups"] == {
        "HumorBot": 200,
        "STARCASM": 200,
        "Control": 200,
    }
    # Protocol eligibility criteria are intentionally not invented in Step 1B.
    assert body["protocol_criteria_configured"] is False


def test_recruitment_submission_review_and_rbac(client, auth_headers, participant_headers):
    submission = client.post(
        "/api/public/recruitment/applications",
        json={
            "preferred_name": "Synthetic Applicant",
            "contact_email": "synthetic.applicant@example.com",
            "recruitment_source": "demo acceptance test",
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
    assert submission.status_code == 201
    application = submission.json()
    assert application["reference_code"].startswith("APP-")
    assert application["status"] == "submitted"
    application_id = application["id"]

    duplicate = client.post(
        "/api/public/recruitment/applications",
        json={
            "preferred_name": "Duplicate Synthetic Applicant",
            "contact_email": "SYNTHETIC.APPLICANT@example.com",
            "consent_to_screen": True,
            "informed_consent_accepted": True, "informed_consent_version": "committee-consent-draft-2026-10-08",
            "privacy_acknowledged": True,
            "screening_answers": {},
        },
    )
    assert duplicate.status_code == 409

    participant_list = client.get(
        "/api/recruitment/applications",
        headers=participant_headers,
    )
    assert participant_list.status_code == 403

    staff_list = client.get(
        "/api/recruitment/applications",
        headers=auth_headers,
    )
    assert staff_list.status_code == 200
    assert any(row["id"] == application_id for row in staff_list.json())

    review = client.patch(
        f"/api/recruitment/applications/{application_id}/review",
        headers=auth_headers,
        json={
            "status": "needs_review",
            "review_note": "Synthetic demo review; protocol criteria are not configured.",
        },
    )
    assert review.status_code == 200
    assert review.json()["status"] == "needs_review"
    assert review.json()["reviewed_by_id"] is not None

    metrics = client.get("/api/recruitment/metrics", headers=auth_headers)
    assert metrics.status_code == 200
    assert metrics.json()["applications"] >= 1
    assert metrics.json()["needs_review"] >= 1

    audit = client.get("/api/admin/audit?limit=100", headers=auth_headers)
    assert audit.status_code == 200
    actions = {row["action"] for row in audit.json()}
    assert "recruitment.application_submitted" in actions
    assert "recruitment.application_reviewed" in actions


def test_public_submission_requires_consent(client):
    response = client.post(
        "/api/public/recruitment/applications",
        json={
            "preferred_name": "Synthetic No Consent",
            "contact_email": "no-consent@example.com",
            "consent_to_screen": False,
            "privacy_acknowledged": True,
            "screening_answers": {},
        },
    )
    assert response.status_code == 422


def test_under_review_is_counted_in_needs_review_metric(client, auth_headers):
    submission = client.post(
        "/api/public/recruitment/applications",
        json={
            "preferred_name": "Synthetic Under Review Applicant",
            "contact_email": "under.review@example.com",
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
    assert submission.status_code == 201
    application_id = submission.json()["id"]

    review = client.patch(
        f"/api/recruitment/applications/{application_id}/review",
        headers=auth_headers,
        json={
            "status": "under_review",
            "review_note": "Synthetic workflow validation.",
        },
    )
    assert review.status_code == 200
    assert review.json()["status"] == "under_review"

    metrics = client.get("/api/recruitment/metrics", headers=auth_headers)
    assert metrics.status_code == 200
    body = metrics.json()
    assert body["under_review"] >= 1
    assert body["needs_review"] >= 1
