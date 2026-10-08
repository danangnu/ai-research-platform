# Simple study prototype

This release extends recruitment with a participant pre-test, three session logs,
a post-test, and a staff results dashboard. It is synthetic-only. Existing
applications, accounts, assignments and protocol drafts are preserved.

## Five-minute walkthrough

1. Open the public website and start a demo application with fictional details.
   Save the private receipt. The screening questionnaire does not determine
   clinical eligibility automatically.
2. Sign in as authorised staff. In **Recruitment**, review the application,
   mark eligibility, record selection, and enroll.
3. In **Participants**, open the coded record and create/link a participant
   login. Provide credentials through the existing agreed secure channel;
   the prototype does not send invitation emails.
4. Sign in as that participant (a separate browser profile is convenient).
   **My study** presents the four-item sample pre-test.
5. Staff assign the demo group using the existing allocation control. Existing
   group assignments are not changed by this release. For a new walkthrough,
   complete the pre-test before staff allocation.
6. The participant opens the assigned StARCASM/DANG demo or the neutral
   exercise, then records minutes, assistance, and comfort for each of three
   sessions. Bot access uses separate reviewer credentials. Session logs are
   self-reports; there is no imported bot transcript or measured bot exposure.
7. Complete the sample post-test. Staff open **Results** to review paired
   scores, missing tests, completion and comfort flags. Export shown rows as
   coded CSV. **Overview** shows outstanding work; **How it works** explains
   the process. Protocol, project and administration remain under Advanced
   settings.

## Data and boundaries

New table: `study_observations`, one immutable record per participant and stage.
The API derives the participant from the signed-in account; clients cannot
submit a different participant ID. A parent-row lock serialises writes on
PostgreSQL and a unique constraint prevents duplicate stages. Exact retries
are idempotent; changed resubmissions return 409. Each submission records the
instrument version, server submission time, responses, actor and audit event.
No correctness feedback is returned to participants. Skips remain explicit.

The dashboard requires existing recruitment-management roles and contains
participant codes rather than applicant names or email addresses. Paired mean
change includes only records with both tests. Sample forms have not been
validated as equivalent; score differences are not evidence of clinical gain.
Dashboard views are refreshed on opening or by the Refresh button. A comfort
flag is an aid for staff review, not an urgent alert or continuous monitoring.

Live clinical use remains blocked when DEMO_MODE is false. Final consent,
eligibility criteria, test instruments, session schedule, allocation protocol,
contact/escalation details, and hosting approval must be configured and reviewed
before a real participant study. No paid hosting changes are part of this release.

## Release

The additive Alembic migration is `20261002_0007`. Existing Render API build runs
`alembic upgrade head`. Deploy API before using the new frontend where possible.
Run `python -m pytest` in backend and `npm ci && npm run build` in frontend.
A UI walkthrough should verify both staff and linked-participant roles.
