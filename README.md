# AI Research Study Management Platform — Step 1A.1

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

The initial administrator is created from `.env`.

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
