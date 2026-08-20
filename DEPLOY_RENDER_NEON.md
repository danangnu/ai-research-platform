# Step 1A.1 — Free Demo Deployment

This revision prepares Step 1A for a **demo-only** internet deployment:

- GitHub repository
- Render free Python web service for FastAPI
- Render static site for React
- Neon PostgreSQL
- automatic Alembic migrations
- deployment readiness health check
- noindex protection
- visible demo-data warning
- no hard-coded browser credentials

> **Important:** This environment is for demonstration and development only.
> Do not collect real participant, clinical, neurological, health or other
> sensitive information in it.

## 1. Push to GitHub

From the project root:

```powershell
git init
git add .
git commit -m "chore: prepare Step 1A demo deployment on Render and Neon"

git branch -M main
git remote add origin https://github.com/<YOUR-ACCOUNT>/ai-research-platform.git
git push -u origin main
```

If the repository already exists, commit and push normally.

Never commit `.env`.

## 2. Create the Neon database

Create a Neon PostgreSQL project and copy its connection string.

It normally looks similar to:

```text
postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Step 1A.1 automatically converts `postgresql://` or `postgres://` URLs to the
explicit SQLAlchemy psycopg 3 driver form.

## 3. Deploy the Render Blueprint

In Render:

```text
New
→ Blueprint
→ Connect the GitHub ai-research-platform repository
→ Render reads render.yaml
```

The Blueprint defines:

```text
ai-research-api     FastAPI web service
ai-research-study   React static site
```

Render will request values marked `sync: false`.

### Backend values

Set:

```text
DATABASE_URL=<Neon connection string>
ADMIN_EMAIL=<dedicated demo administrator email>
ADMIN_PASSWORD=<strong unique demo password>
CORS_ORIGINS=https://ai-research-study.onrender.com
```

If Render gives the frontend a different hostname, update `CORS_ORIGINS`
afterward.

`JWT_SECRET` is generated automatically by Render.

### Frontend value

Set:

```text
VITE_API_URL=https://ai-research-api.onrender.com
```

If Render gives the API a different hostname, use the actual URL.

Vite reads `VITE_API_URL` at build time, so changing it requires a frontend
redeploy.

## 4. Database migrations

Render's free web-service tier does not support a separate pre-deploy command, so the backend build command runs:

```text
pip install -r requirements.txt && alembic upgrade head
```

This applies the Alembic migrations before the new build starts.

The application then seeds the configured administrator at startup if the
administrator does not already exist.

Changing `ADMIN_PASSWORD` later does not automatically overwrite an existing
database user's password. A proper password-reset/user-management workflow
belongs in a later platform step.

## 5. Verify the deployment

Run:

```powershell
.\scripts\verify_deployment.ps1 `
  -ApiUrl "https://<YOUR-API>.onrender.com" `
  -FrontendUrl "https://<YOUR-FRONTEND>.onrender.com" `
  -AdminEmail "your-demo-admin@example.com" `
  -AdminPassword "YOUR-DEMO-PASSWORD"
```

The script checks:

```text
API health
API + Neon readiness
admin login
RBAC
frontend response
noindex header
```

## 6. Demo sequence for Tasha

Use synthetic data only.

```text
1. Open the public Render URL.
2. Show the DEMO ENVIRONMENT warning.
3. Sign in.
4. Show Overview.
5. Open Recruitment foundation.
6. Open Project.
7. Create/select the research project.
8. Show milestones/tasks.
9. Add a project risk.
10. Open Admin.
11. Show study sites.
12. Show the audit trail.
```

Then explain that Step 1B adds:

```text
public recruitment
screening questionnaire
consent
applicant reference
eligibility review
```

## 7. Free-demo limitation

The free Render backend can sleep while idle, so the first request before a
demo can be slow.

Open this several minutes before the meeting:

```text
https://<YOUR-API>.onrender.com/health/ready
```

Do not use the free demo environment for live participant recruitment.

## 8. Before real recruitment

Before collecting real participant information, revisit:

- hosting/service level and uptime
- ethics/institutional requirements
- consent and privacy implementation
- backups and recovery
- data residency
- encryption/key management
- password reset and MFA
- security review and monitoring
- retention/deletion policy
- incident response
