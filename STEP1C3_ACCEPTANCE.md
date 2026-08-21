# Step 1C.3 Acceptance — Participant Management UI

Step 1C.3 adds a searchable participant-management workspace over the accepted
Step 1C.1 enrollment and Step 1C.2 allocation records. It does not change the
allocation engine and does not link participant accounts; account linkage is
reserved for Step 1C.4.

## Privacy and authorization boundary

- The page works with pseudonymous participant records only.
- Applicant names and contact email addresses are not returned by participant APIs.
- `PROJECT_ADMIN`, `RESEARCH_LEAD` and `RESEARCH_ASSISTANT` can view participant management data.
- `PARTICIPANT` cannot list or inspect participant management records.
- Only `PROJECT_ADMIN` and `RESEARCH_LEAD` retain allocation authority.

## Automated backend acceptance

```powershell
cd backend
$env:PYTHONPATH = "."
python -m pytest -q
```

Expected for this build:

```text
19 passed
```

The Step 1C.3 test confirms the participant list/detail data contract, allocation
detail retrieval, privacy-field separation, unlinked-account state and participant
RBAC denial.

## Migration verification

Step 1C.3 requires no new database migration. The accepted allocation migration
remains the current head:

```powershell
cd backend
$env:DATABASE_URL = "sqlite:///./step1c3_migration_test.db"
alembic upgrade head
alembic current
```

Expected:

```text
20260821_0004 (head)
```

## Live deployment verification

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

.\scripts\verify_step1c3.ps1 `
  -ApiUrl "https://ai-research-api-00zg.onrender.com" `
  -AdminEmail "<your admin email>" `
  -AdminPassword '<your admin password>' `
  -ParticipantEmail "participant.demo@example.com" `
  -ParticipantPassword '<demo participant password>'
```

The script creates one synthetic participant, allocates it through the unchanged
Step 1C.2 engine, verifies list/detail fields, confirms that applicant identity
fields are absent and verifies participant-role denial. Its response-property
checks avoid array-subexpression wrapping and use `Get-Member` so top-level JSON
arrays and response properties behave consistently in Windows PowerShell 5.1
and PowerShell 7.

## Manual UI acceptance

1. Sign in as Project Administrator and open **Participants**.
2. Confirm the heading shows **Step 1C.3** and the participant metrics/allocation matrix still match Overview.
3. Search by a full participant code and by a partial code; confirm only matching records remain.
4. Filter by lifecycle status, allocation status, assigned condition and study site.
5. Select **No site** and confirm only participants without a site are shown.
6. Apply **Enrolled from** and **Enrolled to** dates and confirm both boundaries are inclusive.
7. Set **Enrolled from** later than **Enrolled to** and confirm the validation message appears.
8. Test newest, oldest and participant-code sorting.
9. Combine two or more filters and confirm the matching/total counter is correct.
10. Click **View details** and confirm participant ID, application reference, site, enrollment time, lifecycle, allocation and account-link status.
11. For an allocated participant, confirm method, algorithm version, allocation timestamp and immutable record ID are shown.
12. Search for a value with no match and confirm the explicit no-results state.
13. Click **Clear filters** and confirm the full participant list returns.
14. Refresh the browser and confirm stored participant/allocation data remains unchanged.
15. Sign in as Demo Participant and confirm the Participants page remains unavailable.

## Research boundary

`balanced_random_v1` is still a provisional allocation foundation. Step 1C.3
does not finalize the research protocol or implement stratification.
