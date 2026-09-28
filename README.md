# AI Research Study Management Platform — Recruitment Demo (0.7.1)

This release completes the synthetic recruitment journey on the Step 1D.1 baseline:
public study pages, a guided application, a downloadable private receipt, status
lookup, pre-enrollment withdrawal, and staff search/review followed by enrollment,
allocation, and participant account linking. Existing participant and staff portals
remain available through **Staff & participant sign in**.

Start with [the recruitment demo guide](RECRUITMENT_DEMO.md) for a complete
walkthrough, verification commands, and Render deployment settings. This release
does not open clinical recruitment or deliver participant intervention sessions.
Only fictional application data should be entered.

Step 1A establishes the core platform used to manage the HumorBot/STARCASM research project.

## Included in this build

- FastAPI backend
- PostgreSQL persistence
- SQLAlchemy 2.x models
- Alembic migrations
- Authentication with signed JWT access tokens
- Password hashing with Python `hashlib.scrypt`
- Role-based access control (RBAC)
- Project, milestone, task, task-update and risk management
- Study-site management
- Administrative audit log
- React + TypeScript management UI
- Docker Compose development environment
- Backend tests and a PowerShell smoke test

## Roles

The seed process creates these roles:

- `PROJECT_ADMIN`
- `RESEARCH_LEAD`
- `AI_ML_RESEARCH_ENGINEER`
- `RESEARCH_ASSISTANT`
- `SITE_COORDINATOR`
- `PARTICIPANT`

The initial administrator is created from `.env`. In demo mode, an optional
`PARTICIPANT` acceptance-test identity is also seeded when
`DEMO_PARTICIPANT_EMAIL` and `DEMO_PARTICIPANT_PASSWORD` are configured.

## Repository structure

```text
ai-research-platform/
├── backend/
│   ├── alembic/
│   ├── app/
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── scripts/
│   └── smoke_test.ps1
├── docker-compose.yml
├── .env.example
└── .gitignore
```

## Quick start with Docker

Copy the environment file:

```powershell
Copy-Item .env.example .env
```

Change at least:

```text
JWT_SECRET
ADMIN_PASSWORD
```

Start the stack:

```powershell
docker compose up --build
```

Open:

```text
Frontend: http://localhost:5173
API:      http://localhost:8000
Docs:     http://localhost:8000/docs
```

Default administrator values come from `.env.example`. Change them before any non-local deployment.

## Run backend without Docker

Create a Python 3.11+ environment, install dependencies and point `DATABASE_URL` to PostgreSQL:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

alembic upgrade head
uvicorn app.main:app --reload
```

## Run frontend without Docker

```powershell
cd frontend
npm install
npm run dev
```

## Acceptance smoke test

With the backend running:

```powershell
.\scripts\smoke_test.ps1
```

The smoke test checks:

- health endpoint
- admin login
- authenticated `/me`
- project creation
- milestone creation
- task creation/update
- risk creation
- study-site creation
- audit log visibility

## Step 1A.1 patch 0.1.2

- Project-page create actions now refresh the UI immediately after successful
  project, milestone, task and risk writes; a browser refresh is no longer needed.
- The form element is captured before awaiting the API call, preventing the
  asynchronous `event.currentTarget.reset()` null-reference failure.
- Newly created projects are explicitly reloaded by ID so their child lists are
  synchronized immediately.
- Demo deployments can seed a least-privilege `PARTICIPANT` identity for RBAC
  acceptance testing without adding a general user-management API.

## Step 1A boundary

This build deliberately does **not** implement the full recruitment questionnaire, participant allocation, pre/post tests, or HumorBot/STARCASM study sessions. Those come after the foundation is validated.

An applicant must not be treated as a study participant until the later eligibility/selection workflow explicitly creates a participant record.

## Suggested first commit

```text
feat: establish research platform core authentication project management and audit
```


## Online demo deployment

Step 1A.1 adds Render + Neon deployment support.

Read:

```text
DEPLOY_RENDER_NEON.md
```

The online demo intentionally displays a warning not to enter real participant
or sensitive information.


## Step 1A.1 v0.1.3

- Clears project/admin React state when the authenticated identity changes or logs out.
- Prevents PARTICIPANT/SITE_COORDINATOR sessions from loading project or audit data.
- Uses role-aware navigation and a participant-safe overview.
- Aligns project UI actions with backend RBAC permissions.
- Allows demo participant password rotation through Render environment variables on redeploy.


### Step 1B v0.2.1 review-counter fix

The Recruitment dashboard's **Needs review** metric now represents the active
review queue. It counts both `under_review` and `needs_review` applications.
The detailed API still returns `under_review` separately.


## Step 1C.1 v0.3.0 — Selection & Enrollment Foundation

- Adds a selection decision layer separate from eligibility review.
- Only eligible applicants can be marked selected, waitlisted or not selected.
- Only selected applicants can be enrolled.
- Enrollment creates one server-generated pseudonymous participant identity per application.
- Enrollment retries are idempotent and cannot create duplicate participants.
- Participant research records do not contain applicant name or contact email.
- New participants are `enrolled` and `not_allocated`; `study_group` remains null.
- Adds participant management metrics/list UI and immediate post-write refresh.
- Adds `participant.selection_recorded` and `participant.enrolled` audit events.
- Participant-management data remains restricted to recruitment roles.
- HumorBot/STARCASM/Control allocation is deliberately deferred to Step 1C.2.

Deployment verification is documented in `STEP1C1_ACCEPTANCE.md` and automated by `scripts/verify_step1c1.ps1`.


## Step 1C.2 v0.3.1 — Experimental Allocation Foundation

- Adds one immutable allocation record per enrolled participant.
- Allocation can be triggered only by `PROJECT_ADMIN` or `RESEARCH_LEAD`.
- `RESEARCH_ASSISTANT` can continue participant-management reads but cannot trigger allocation.
- Uses a server-side **balanced random foundation**: assign only among groups with the current minimum count, then randomly break ties.
- Enforces a hard capacity of 200 HumorBot, 200 STARCASM and 200 Control allocations.
- Stores the counts-before snapshot, minimum-count tie candidates, random draw, tie index, algorithm version and selected group for audit reconstruction.
- Allocation retries are idempotent and never change the participant's assigned group.
- A PostgreSQL row lock serializes allocation decisions so concurrent requests cannot bypass capacity/balance checks.
- Updates participant metrics, Overview recruitment matrix and Participants UI immediately after allocation.
- Adds `participant.allocated` audit events.
- The allocation engine is explicitly marked `protocol_finalized = false`: final stratification/randomization criteria remain subject to the approved research protocol.

Deployment verification is documented in `STEP1C2_ACCEPTANCE.md` and automated by `scripts/verify_step1c2.ps1`.


## Step 1C.3 v0.4.0 — Participant Management UI

- Adds participant-code and technical-ID search without exposing applicant identity.
- Adds lifecycle, allocation, assigned-condition, site and inclusive enrollment-date filters.
- Adds newest, oldest and participant-code sorting with 25-row pagination.
- Adds a participant detail panel for pseudonymous identifiers, site, enrollment, lifecycle, allocation and account-link status.
- Loads immutable allocation method, algorithm version, timestamp and record ID for allocated participants.
- Adds explicit loading, error, empty-list and no-filter-match states.
- Preserves participant-management RBAC and keeps participant accounts unlinked until Step 1C.4.
- Does not change the accepted Step 1C.2 allocation algorithm, capacity or protocol boundary.

Deployment verification is documented in `STEP1C3_ACCEPTANCE.md` and automated by `scripts/verify_step1c3.ps1`.


## Step 1C.4 v0.5.0 — Participant Account & RBAC Integration

- Allows `PROJECT_ADMIN` and `RESEARCH_LEAD` to create or link an active participant-only login to an enrolled participant.
- Enforces one immutable account link per participant and one participant per account through server checks and the existing unique database constraint.
- Makes same-participant/same-account retries idempotent without rotating credentials or duplicating audit records.
- Rejects inactive, privileged or mixed-role accounts and prevents participant sessions from administering account links.
- Adds `GET /api/participant/me`, which resolves only the participant linked to the signed-in account.
- Returns participant code, site, lifecycle, allocation status, assigned condition and enrollment time while excluding recruitment identity and allocation trace metadata.
- Adds an own-record **My Study Portal** and an administrator account-link control in participant detail.
- Adds `participant.account_linked` audit events containing pseudonymous/technical IDs but no account email.
- Preserves all accepted Step 1C.1–1C.3 enrollment, allocation and participant-management behavior.

Deployment verification is documented in `STEP1C4_ACCEPTANCE.md` and automated by `scripts/verify_step1c4.ps1`.

Production invitation delivery, password reset, multi-factor authentication and participant study sessions remain deferred. Use synthetic credentials in the demo environment.


## Step 1C.5 v0.6.0 — Audit + Acceptance Testing

- Adds a correlated participant audit-trail endpoint combining application, eligibility review, selection, enrollment, allocation and account-link events.
- Removes request IP addresses from the participant-management audit-trail response while preserving actor, entity, timestamp and privacy-safe event details.
- Displays the chronological Step 1C audit trace in participant detail.
- Adds linked-account totals to participant-management metrics and the dashboard.
- Adds a consolidated backend test for lifecycle locks, idempotency, allocation traceability, account immutability, fresh-login persistence, privacy, RBAC and dashboard-count reconciliation.
- Adds a live PowerShell verifier for the complete application-to-participant-account workflow.
- Keeps the accepted Step 1C.1–1C.4 behavior and database schema unchanged.

Deployment verification is documented in `STEP1C5_ACCEPTANCE.md` and automated by `scripts/verify_step1c5.ps1`.

Step 1C engineering acceptance does not approve `balanced_random_v1` for live research. Final protocol-defined stratification and governance approval are still required.


## Step 1D.1 v0.7.0 — Protocol & Stratification Foundation

- Adds a project-scoped, versioned study-protocol registry.
- Stores the fixed 600-participant target and 200-person HumorBot, STARCASM and Control condition definitions.
- Stores configurable stratification factors, factor levels, experimental task blocks and permitted allocation block sizes without yet performing final allocation.
- Validates the participant randomization unit, `stratified_permuted_block` method, target reconciliation, unique factors/levels, three-condition block compatibility and controlled protocol-document reference.
- Allows only `PROJECT_ADMIN` and `RESEARCH_LEAD` to create, edit and approve protocol drafts; approved research staff retain read access.
- Stores a canonical SHA-256 configuration hash on approval and makes the approved version immutable.
- Makes approval idempotent and records `protocol.created`, `protocol.updated` and `protocol.approved` audit events.
- Keeps protocol management unavailable to participant accounts.
- Adds a Study UI for draft creation/editing, validation results, version history, condition/strata inspection and approval.
- Deliberately blocks activation until Step 1D.2 connects the approved hash and participant strata to the final allocation engine.
- Preserves the accepted provisional `balanced_random_v1` behavior and `protocol_finalized = false` boundary.

Deployment verification is documented in `STEP1D1_ACCEPTANCE.md` and automated by `scripts/verify_step1d1.ps1`.
