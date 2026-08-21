# Step 1B Acceptance — Recruitment Intake & Eligibility Review

Step 1B adds the recruitment workflow without creating enrolled participant records or assigning study conditions.

## Acceptance checks

- Public recruitment information endpoint is available.
- Public synthetic application can be submitted when `RECRUITMENT_OPEN=true`.
- Submission requires consent-to-screen and privacy acknowledgement.
- Submission receives a non-sequential `APP-...` reference.
- Duplicate active submissions by normalized email are rejected where feasible.
- Recruitment staff can list applications and view screening responses.
- Recruitment staff can record `under_review`, `needs_review`, `eligible`, or `ineligible` status.
- Eligibility review changes are audited without copying contact details or questionnaire responses into the audit event.
- `PARTICIPANT` cannot access recruitment staff endpoints (`403`).
- AI/ML engineering and unscoped site-coordinator access are not automatically granted applicant-level recruitment data.
- No applicant is converted into a participant and no HumorBot/STARCASM/Control allocation occurs in Step 1B.
- The UI states that demo screening fields are not approved inclusion/exclusion criteria and no automatic eligibility rule is applied.

## Protocol boundary

The research plan requires the research team to approve eligibility/exclusion rules, recruitment questionnaire structure, consent/privacy requirements, and allocation methodology. Step 1B implements the workflow and data boundary, not those still-unapproved research decisions.

## Automated test

```powershell
cd backend
python -m pytest -q
```

Expected for this build:

```text
13 passed
```

## Live Render verification

```powershell
.\scripts\verify_step1b.ps1 `
  -ApiUrl "https://<YOUR-API>.onrender.com" `
  -AdminEmail "<ADMIN_EMAIL>" `
  -AdminPassword '<ADMIN_PASSWORD>' `
  -ParticipantEmail "<DEMO_PARTICIPANT_EMAIL>" `
  -ParticipantPassword '<DEMO_PARTICIPANT_PASSWORD>'
```

Use synthetic demo values only.
