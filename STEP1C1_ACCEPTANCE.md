# Step 1C.1 Acceptance — Selection & Enrollment Foundation

Step 1C.1 extends the accepted Step 1B recruitment workflow. It does not perform experimental allocation.

## Boundary

- Only an `eligible` recruitment application can receive a selection decision.
- Selection is separate from eligibility: `selected`, `waitlisted`, or `not_selected`.
- Only `selected` applications can be enrolled.
- Enrollment creates one pseudonymous participant identity and is idempotent by application.
- Participant records do not expose applicant name or contact email.
- New participants start as `enrolled`, `not_allocated`, with `study_group = null`.
- HumorBot/STARCASM/Control allocation remains Step 1C.2.
- Recruitment/participant-management endpoints remain restricted to recruitment roles.
- Selection and enrollment writes are audited.

## Automated backend acceptance

```powershell
cd backend
$env:PYTHONPATH = "."
python -m pytest -q
```

Expected: all Step 1A, Step 1A.1, Step 1B and Step 1C.1 tests pass.

## Deployment acceptance

After Render finishes the backend migration and frontend deployment:

```powershell
.\scripts\verify_step1c1.ps1 `
  -ApiUrl "https://ai-research-api-00zg.onrender.com" `
  -AdminEmail "<your admin email>" `
  -AdminPassword '<your admin password>' `
  -ParticipantEmail "participant.demo@example.com" `
  -ParticipantPassword '<demo participant password>'
```

Then validate the UI:

1. Recruitment → open an eligible synthetic application.
2. Save `Selected` under Participant selection.
3. Confirm the selection remains after refresh.
4. Click `Enroll participant`.
5. Confirm a `P-xxxxxx` participant code appears and Allocation remains `Not allocated`.
6. Refresh and confirm the participant still exists.
7. Open Participants and confirm counts/list update without a manual browser refresh after writes.
8. Open Admin and confirm `participant.selection_recorded` and `participant.enrolled` audit events.
9. Sign in as the demo PARTICIPANT and confirm Recruitment/Participants management are unavailable.
