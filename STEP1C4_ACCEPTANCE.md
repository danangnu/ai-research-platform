# Step 1C.4 Acceptance — Participant Account & RBAC Integration

Step 1C.4 links an authenticated `PARTICIPANT` account to one enrolled,
pseudonymous participant identity. The participant portal reads only the record
linked to the signed-in account. Staff management, recruitment, project,
allocation-trace and audit APIs remain unavailable to participant sessions.

## Security contract

- Only `PROJECT_ADMIN` and `RESEARCH_LEAD` can create or link participant accounts.
- A participant must be enrolled before an account can be linked.
- A participant can have one account and an account can belong to one participant.
- Existing accounts must be active and have exactly the `PARTICIPANT` role.
- Retrying the same link is idempotent and does not change the password.
- A successful first link writes one `participant.account_linked` audit event.
- The audit event stores pseudonymous and technical IDs, never the account email.
- `/api/participant/me` returns only the signed-in participant's safe study fields.
- Unlinked participant logins receive a clear 404 linkage state.

## Automated backend acceptance

```powershell
cd backend
$env:PYTHONPATH = "."
python -m pytest -q
```

Expected:

```text
20 passed
```

## Migration verification

Step 1C.4 uses the unique nullable `participants.user_id` field delivered by
Step 1C.1, so no new database migration is required. The accepted allocation
migration remains the current head:

```powershell
cd backend
$env:DATABASE_URL = "sqlite:///./step1c4_migration_test.db"
alembic upgrade head
alembic current
```

Expected:

```text
20260821_0004 (head)
```

## Live deployment verification

From the release root in PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\scripts\verify_step1c4.ps1 `
  -ApiUrl "https://ai-research-api-00zg.onrender.com" `
  -AdminEmail "<your admin email>" `
  -AdminPassword '<your admin password>'
```

The verifier creates only synthetic data. It runs the accepted application,
eligibility, selection, enrollment and allocation path; creates and links a new
participant-only account; signs in as that account; validates its own-record
contract and privacy boundary; verifies 403 responses across staff APIs; checks
link persistence, immutability/idempotency and the single audit event.

## Manual UI acceptance

1. Sign in as Project Administrator and open **Participants**.
2. Select an enrolled participant with **View details**.
3. In **Link participant account**, enter a synthetic email, display name and a 12+ character initial password.
4. Confirm the participant displays **Linked to participant-only login** and an **account linked** badge.
5. Refresh the browser and confirm the linked state persists.
6. Sign out and sign in with the new participant credentials.
7. Confirm **My Study Portal** shows the same participant code, lifecycle, allocation status and assigned condition.
8. Confirm the participant navigation does not expose Recruitment, Participants, Project, Models, Analysis or Admin.
9. Confirm no application ID, applicant name/email, allocation algorithm/basis or audit record appears in the participant portal.
10. Sign back in as administrator, open **Admin**, and confirm one `participant.account_linked` audit event exists.

Use synthetic/demo-only data until the approved consent, privacy, identity,
credential-delivery and operational-security procedures are finalized.
