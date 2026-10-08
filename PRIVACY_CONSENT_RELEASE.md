# Participant identity and online consent update

8 October 2026. Committee and IRB demonstration; real recruitment stays closed.

## Confirmed workflow

Three outpatient brain injury clinics distribute email links. Interested people complete online consent and screening; selection method remains for the committee. Selected participants receive a number and welcome instructions, sign in, complete baseline assessment, undertake assigned activities for 30 days, then complete follow-up and participant feedback. The three conditions remain HumorBot (DANG), STARCASM and Control. The 600-person / 200-per-group allocation foundation remains provisional. Digit Span is preserved separately, including the newer Memory Recall title on tmlee10.

## Implemented privacy boundary

Normal recruitment outputs redact names, email, source and historical free-text review notes for all roles. Only the three existing boolean screening fields are returned from old screening JSON; arbitrary legacy fields are excluded. Participant outputs replace application and account IDs with null and expose only an account-linked boolean. Selection notes and historical audit identity details are redacted. All API responses use no-store.

POST /api/admin/identity-reveal requires PROJECT_ADMIN and the configured ADMIN_EMAIL, explicit confirmation, participant numbers and a purpose. The audit transaction commits before identity rows are returned. It never stores revealed names/emails in its own audit details. The screen clears results after 60 seconds or explicit dismissal. Other administrators, research leads, assistants, engineers, coordinators and participants cannot reveal identities.

Account provisioning is limited to the designated administrator and derives its email from the protected application rather than accepting arbitrary caller-supplied identity links. Existing account links and historical allocations remain unchanged. These controls restrict application access; infrastructure/database administrators still require governance. Participant-written free text can contain identifiers and must be reviewed before research exports are shared.

## Online consent and schedule

The public application now begins with a draft online informed-consent step. The API requires acceptance of the exact current version; it stores the server timestamp, full text snapshot, SHA-256 and synthetic-only flag in a new consent_records table. Old applications are not assigned retrospective consent. This demonstration does not constitute approved research consent.

New prepared configurations default to 30 days and no interim visit. Existing immutable configurations and active runs retain their original schedules. The standalone committee page calculates baseline plus 30 calendar days, includes consent and welcome/tutorial previews, and exports draft acknowledgement metadata. The public page keeps entries only in memory; the authenticated recruitment backend stores its records in the database.

## Pending committee or operational decisions

Final eligibility and selection rules, comparable pre/post instruments, administration/scoring, approved consent wording and placement, session schedule, control activities, clinic names and support email, email delivery, and the statistical analysis plan remain pending. Existing provisional MoCA/Trail Making baseline and SAGE follow-up fields remain separate; no cross-test change score or ANOVA is calculated. The proposed three-group pre/post analysis requires confirmation before implementation.

The welcome package is a preview, not automated email delivery. The authenticated workflow remains a synthetic prototype with administrator configuration/allocation/provisioning and sample assessments; this release does not certify a production clinical study.

## Verification

Backend regression and new privacy/consent tests: 37 passing locally. Coverage includes historical identity data, all non-custodian roles, successful logged reveal, audit failure before disclosure, consent rejection/version storage, 30-day defaults, immutable allocation, persistence, participant isolation and coded exports. Production frontend build passes. Migration through 20261008_0009 passes on a fresh disposable SQLite database. Browser acceptance and deployment status are recorded in the refreshed report.
