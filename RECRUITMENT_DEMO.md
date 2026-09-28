# Recruitment demo — 0.7.1

The public website demonstrates recruitment for StARCASM and HUMOR Bot. The
implemented journey ends at an allocated participant record with a linked login.
Study activities, clinical consent, and real eligibility decisions require a
separate approved protocol and implementation.

## Walkthrough

1. Open the frontend at `/#home`. Select **Start a demo application**, then
   **Fill fictional example**. This generates an `example.com` address.
2. Move through contact details, screening questions, and review. Confirm both
   demonstration acknowledgements and submit. Answers survive Back/Continue.
3. Download the receipt. It contains the application reference and private access
   key. The key is shown once in the submission response and is not emailed.
4. Open `/#status` in a fresh page and enter both receipt values. The page shows
   progress without exposing contact details or internal review notes.
5. Sign in as an authorised staff account at `/#signin`. Open **Recruitment**,
   search the reference, save an eligibility review, and save a selection decision.
6. For an eligible, selected application, select **Enroll participant**. Under
   **Participants**, find the new participant code and open **View details**.
7. Run server-side allocation, then create or link a participant account using
   the account form. Staff must arrange delivery of login details separately;
   this release does not send invitations or password-reset email.
8. In a separate browser session, sign in as that participant. The participant
   portal shows the linked record and allocation. Staff recruitment and admin
   controls are not available to that account.
9. Refresh the application status page: the stage now reads **Login access ready**.

For a second fictional application, use **Withdraw this application** on its
status page before enrollment. The confirmation can be cancelled. A confirmed
withdrawal prevents review changes, selection, and enrollment. After enrollment,
the page directs the applicant to staff; it does not perform study withdrawal.

## Public routes and access

| Route | Purpose |
| --- | --- |
| `/#home` | Study introduction, recruitment journey, FAQ |
| `/#apply` | Three-step synthetic application and receipt |
| `/#status` | Private status lookup and pre-enrollment withdrawal |
| `/#signin` | Existing staff and participant login |
| `/#workspace` | Existing authenticated workspace |

Status and withdrawal send the reference and key in a POST body. The server
stores only a SHA-256 hash of the random key, uses constant-time comparison, and
returns a restricted status response with `Cache-Control: no-store`. Keys are
not included in staff exports, audit events, URLs, or browser storage. The
downloaded receipt is private: anyone holding both values can read that status
and withdraw an application before enrollment.

There is no key recovery workflow. Existing applications created before this
release have no key and remain accessible through staff tools. Losing a receipt
requires staff assistance. Refreshing the browser clears the in-memory key.

The existing model demonstration links require separate reviewer credentials.
Those demonstrations are not assigned participant sessions. Existing allocation
targets and groups remain demo configuration; this release does not establish
a clinical sample size or protocol.

## Local verification

Install the backend requirements in a Python environment, then run:

```sh
cd backend
python -m pytest -q
cd ../frontend
npm ci
npm run build
npx playwright install chromium
cd ..
python scripts/test_recruitment_ui.py
```

The browser runner starts its own API and frontend on free local ports, migrates
a temporary SQLite database, and generates temporary credentials. It does not
contact a deployed service. Screenshots are written to the ignored
`frontend/test-results/` folder. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` only when
using an existing compatible Chromium binary. CI installs browser dependencies
and runs the same test.

Acceptance coverage includes desktop and mobile submission, receipt download,
fresh-page status, invalid access keys, staff review/selection/enrollment,
allocation, account linking, participant login and refresh, withdrawal,
connection-error recovery, horizontal overflow, and uncaught browser errors.
Backend tests cover privacy, intake gating, legacy records, and withdrawal locks.

## Deploy to the existing Render services

Merge the reviewed branch, then deploy the API before the static frontend.
The existing `render.yaml` API build runs `alembic upgrade head`; the new
`20260928_0006` migration adds a nullable access-key hash without deleting existing
records. Keep the database on persistent PostgreSQL storage.

| Service | Setting | Value |
| --- | --- | --- |
| API | `DEMO_MODE` | `true` |
| API | `RECRUITMENT_OPEN` | `true` for synthetic submissions; `false` closes intake |
| API | `CORS_ORIGINS` | Exact frontend origin, without a trailing slash |
| API | `DATABASE_URL` | Existing PostgreSQL connection |
| API | `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Existing private deployment values |
| Frontend | `VITE_API_URL` | Deployed API origin, without a trailing slash |
| Frontend | `VITE_DEMO_MODE` | `true` |

Both `DEMO_MODE` and `RECRUITMENT_OPEN` must be true for new applications. Setting
`DEMO_MODE=false` does not activate real recruitment. Existing receipt lookups
and pre-enrollment withdrawal remain available when intake is closed.

After deployment, confirm `/health/ready` succeeds, `/health` reports
`0.7.1-recruitment-demo`, and the frontend displays the demonstration banner.
Repeat the walkthrough with fictional data. Rebuild the frontend after changing
any `VITE_` setting, because these values are compiled into the browser bundle.

For an application rollback, redeploy the previous API/frontend versions and
retain the additive database column. Do not drop applicant records or run a
destructive database reset.
