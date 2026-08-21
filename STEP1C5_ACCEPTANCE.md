# Step 1C.5 Acceptance — Audit + Acceptance Testing

Step 1C.5 closes the engineering acceptance cycle for selection, enrollment,
allocation, participant management and participant-account integration. It
does not declare the provisional allocation procedure statistically approved.

## Consolidated acceptance contract

- Application → eligible → selected → enrolled → allocated → account linked.
- Enrollment, allocation and account-link retries return the same immutable records.
- Eligibility and selection are locked after enrollment.
- Allocation retains its counts-before basis, random tie evidence, algorithm version and provisional-protocol marker.
- One correlated participant audit trail contains exactly one event for each completed Step 1C stage.
- Fresh administrator and participant logins retrieve the same persisted identities and assignment.
- Participant sessions remain self-only and cannot read audit, management, recruitment, project or allocation-summary data.
- Participant, enrolled, allocated, linked-account, group, capacity and application metrics reconcile with persisted lists.

## Automated backend acceptance

```powershell
cd backend
$env:PYTHONPATH = "."
python -m pytest -q
```

Expected:

```text
21 passed
```

## Frontend build

```powershell
cd frontend
npm ci
npm run build
```

## Migration verification

Step 1C.5 adds no database migration. It uses the existing audit events and
participant relationship constraints. The current head remains:

```powershell
cd backend
$env:DATABASE_URL = "sqlite:///./step1c5_migration_test.db"
alembic upgrade head
alembic current
```

Expected:

```text
20260821_0004 (head)
```

## Live deployment verification

From the release root:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\scripts\verify_step1c5.ps1 `
  -ApiUrl "https://ai-research-api-00zg.onrender.com" `
  -AdminEmail "<your admin email>" `
  -AdminPassword '<your admin password>'
```

The verifier creates one synthetic lifecycle and then checks immutable retries,
post-enrollment locks, allocation trace data, account linkage, participant
privacy and RBAC, fresh-session persistence, the six correlated audit events,
and reconciliation of all Step 1C dashboard counts.

## Manual UI acceptance

1. Sign in as Project Administrator and confirm the current badge shows **Step 1C.5**.
2. Open **Participants** and confirm **Total participants**, **Enrolled**, **Allocated**, **Linked accounts** and **Remaining target** are visible.
3. Confirm the three allocation-matrix totals equal the allocated count.
4. Select a fully processed participant and confirm **Step 1C audit trace** appears in participant detail.
5. Confirm the trace contains one each of submitted, reviewed, selected, enrolled, allocated and account-linked events.
6. Confirm every trace row displays timestamp, entity and actor, but no applicant email or IP address.
7. Refresh the browser and confirm participant code, assigned condition, linked-account state, allocation record ID and audit trace remain unchanged.
8. Open **Admin** and confirm the same lifecycle events remain present in the global audit log.
9. Sign in as the linked participant and confirm **My Study Portal** still shows only that participant's code, lifecycle, allocation status and assigned condition.
10. Confirm the participant cannot see Recruitment, Participants, Project, Models, Analysis or Admin.

## Research boundary

`balanced_random_v1` remains a provisional engineering foundation with a
200-per-group cap. Live participant allocation still requires the final
research-lead/ethics-approved randomization and stratification procedure.

## Suggested commit

```text
test(step-1c5): close participant lifecycle acceptance and audit traceability
```
