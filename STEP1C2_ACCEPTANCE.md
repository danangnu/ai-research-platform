# Step 1C.2 Acceptance — Experimental Allocation Foundation

Step 1C.2 extends the accepted Step 1C.1 enrollment workflow with controlled study-group allocation. It is an **allocation foundation**, not the final protocol-approved statistical randomization procedure.

## Allocation boundary

- Only an `enrolled` and `not_allocated` participant can receive a first allocation.
- Only `PROJECT_ADMIN` and `RESEARCH_LEAD` can trigger allocation.
- The API does not accept a requested study group from the administrator.
- The server computes the current HumorBot/STARCASM/Control counts.
- Groups at 200 are excluded.
- Assignment is limited to groups with the current minimum count.
- A cryptographic random draw breaks ties among those minimum-count groups.
- The draw, tie index, candidates, counts-before snapshot and algorithm version are stored in the immutable allocation record.
- The participant is updated to `allocation_status = allocated` and receives the recorded group.
- A retry returns the original allocation and never re-randomizes.
- A single PostgreSQL allocation-state row is locked during the decision to serialize concurrent allocation transactions.
- The target capacity is fixed at 600: 200 HumorBot, 200 STARCASM and 200 Control.
- `protocol_finalized` remains `false`; final stratification/randomization must be approved separately.

## Automated backend acceptance

```powershell
cd backend
$env:PYTHONPATH = "."
python -m pytest -q
```

Expected for this build:

```text
18 passed
```

The Step 1C.2 tests additionally confirm:

- participant and research-assistant allocation denial (`403`)
- balanced first-cycle assignment (one of each group across three allocations)
- idempotent allocation retry
- participant/group persistence
- group metrics
- audit event uniqueness
- 200-per-group capacity enforcement

## Migration verification

```powershell
cd backend
$env:DATABASE_URL = "sqlite:///./step1c2_migration_test.db"
alembic upgrade head
alembic current
```

Expected head:

```text
20260821_0004 (head)
```

## Live Render verification

After the backend migration and frontend deployment complete:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\scripts\verify_step1c2.ps1 `
  -ApiUrl "https://ai-research-api-00zg.onrender.com" `
  -AdminEmail "<your admin email>" `
  -AdminPassword '<your admin password>' `
  -ParticipantEmail "participant.demo@example.com" `
  -ParticipantPassword '<demo participant password>'
```

The script creates one synthetic applicant, makes it eligible and selected, enrolls it, allocates it server-side, verifies persistence and idempotency, checks the 200/200/200 summary, confirms participant RBAC, and verifies exactly one `participant.allocated` audit event.

## UI acceptance

1. Open **Participants** as Project Administrator.
2. Confirm an enrolled/not-allocated participant has **Run server-side allocation** and no manual group dropdown.
3. Click the allocation button once.
4. Confirm the participant immediately shows `allocated` and one of HumorBot/STARCASM/Control without refreshing.
5. Confirm the Allocation Matrix increments the same group.
6. Refresh the browser and confirm the assignment is unchanged.
7. Open **Overview** and confirm the same group count appears in the 200/200/200 matrix.
8. Return to **Participants** and confirm there is no reallocation button for the allocated participant.
9. Open **Admin** and confirm one `participant.allocated` event with the participant ID and assigned group.
10. Sign in as Demo Participant and confirm participant-management/allocation operations remain unavailable.

## Research interpretation

Do not describe `balanced_random_v1` as the study's final randomization method. The final allocation/stratification method must be specified and approved in the study protocol before live assignment.
