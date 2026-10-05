# Configurable study preparation

This branch adds a separate, synthetic-only preparation workflow. It does not activate a clinical study, supply standardized cognitive tests, or change either bot's model. The original four-item / three-session walkthrough remains available to its existing participants.

## Staff workflow

1. Open **Study preparation** as a project administrator or research lead. Research assistants can view configurations, progress and exports but cannot change study setup.
2. Enter a version name, population note and instructions for interaction with the assigned bot. Set duration, suggested frequency and session length. The draft defaults are 90 days, three sessions/week and 5–10 minutes. These are editable planning values; 90 days is not exactly three calendar months.
3. Add the background questionnaire, pre-test and post-test. Forms accept single choices, free text and numbers. Leave forms empty while waiting for materials; incomplete configurations can be saved but cannot be assigned.
4. Choose unscored recording or an explicit sum of choice points. The questionnaire is unscored. Sum scoring only supports nonnegative integer choice weights; it is not a general standardized-test scoring engine. A skipped optional item leaves the total missing, rather than assigning zero. Pre/post change is computed only when scale identifiers and score ranges match. This permits arithmetic, not a claim of clinical equivalence.
5. Save the version. Saved definitions are immutable and hashed. To revise, load a copy and save under a new version. Existing runs remain pinned to the original definition.
6. Enroll and link a **new fictional participant** using the existing recruitment and participant screens. Assign the prepared version before collecting any legacy demo answers. Existing demo responses cannot be moved to this workflow.
7. Sign in as the linked participant and complete the questionnaire and baseline. Complete group allocation using the existing Participants screen, then select **Start period** in Study preparation. The server requires completed baseline and allocation before starting the clock.
8. Record interactions during the configured period. One append-only log is allowed per elapsed 24-hour study day. The weekly frequency is a suggested target, not an enforced quota. The UI records actual minutes, assistance and comfort; it does not capture bot dialogue, train models, or verify that an external bot was used.
9. The post-test opens when the configured number of days has elapsed. Missing session logs do not block follow-up. There is no production clock override or early-post-test button. Automated tests advance an injected clock to verify the 90-day boundary. An interim day is stored as an informational due date only; no interim form, notification or automated reminder is implemented.
10. Download the ZIP export from Study preparation. It includes all saved legacy and prepared study records, not only the displayed rows. The two workflows have separate version labels and must not be pooled automatically.

## Export and analysis

The export includes `participants.csv`, `assessments.csv`, `responses.csv`, `sessions.csv`, exact source responses, configuration snapshots, legacy form definitions, a manifest and a data dictionary. CSV strings are escaped against spreadsheet formulas; the JSON source retains exact content. Missing visits have no assessment row, and participant codes provide the denominator. Identity/contact and authentication tables are excluded. Free text can still identify a person, so exports remain restricted.

This is a research extract, not a full database backup. Pause demo editing during export for consistency across tables. Data are read in one database session, but a PostgreSQL default READ COMMITTED transaction does not guarantee a point-in-time snapshot across queries.

Python is the intended analysis route because versioned scripts can reproduce the calculations and figures from these exports. CSV files can also be imported into SPSS if required. No confirmatory analysis or clinical score interpretation is supplied by this preparation feature.

## Decisions still needed

The approved study materials must establish questions, scoring, eligibility, consent, schedule and permitted administration. The latest discussion describes participants receiving treatment for brain injuries and interaction intended to train a bot; an earlier outline described MCI. The population, meaning of “training a bot,” exact three-month timing and any interim assessment need confirmation. No population or cognitive instrument has been invented to resolve these differences.

Clinician-administered or licensed instruments may require a different administration interface, permission and scoring implementation. Do not assume that placing their questions in a web form reproduces the standardized test. Clinical recruitment remains outside this synthetic preparation route.

## Deployment and validation

The branch is for review. No live deployment or clinical activation is part of this change. It includes the October 2 demo source baseline because the accessible `danangnu` main branch lacked that workflow; compare carefully before applying to a newer `tmlee10` deployment.

Apply Alembic migrations through `20261005_0008` before starting the API. The migration creates three new tables and leaves existing observations intact. Downgrading this migration drops those new preparation tables, so export/back up any prepared records first. All preparation endpoints require `DEMO_MODE=true` and server-side roles. Participant requests are restricted to the account-linked record; assessment weights and scores are not returned to participants.

Validation commands:

```sh
cd backend
python -m pytest -q
alembic upgrade head
cd ../frontend
npm ci
npm run build
npx playwright install chromium
cd ..
python scripts/test_study_preparation_ui.py
```

Backend tests cover version immutability, response validation, missing totals, role restrictions, legacy isolation, duplicate submissions, late follow-up with missed sessions, and ZIP export contents/formula escaping. A local browser acceptance test exercises form editing, assignment, participant submission and staff export against a disposable database.
