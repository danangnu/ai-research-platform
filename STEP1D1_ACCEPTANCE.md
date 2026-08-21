# Step 1D.1 — Protocol & Stratification Foundation

## Release

- API version: `0.7.0-step1d1`
- Frontend version: `0.7.0`
- Migration head: `20260821_0005`
- New migration: `20260821_0005_step1d1_protocol_foundation.py`

## Boundary

This step provides protocol versioning, validation, approval, hashing, immutability,
RBAC and audit evidence. It does **not** activate a final randomization procedure.
The existing `balanced_random_v1` engine remains provisional and continues to
report `protocol_finalized = false`.

Protocol activation is intentionally blocked until Step 1D.2 connects an
approved protocol hash, captured participant strata and the final stratified
allocation engine.

## Deploy

Deploy the ZIP through the existing Render services. The backend build command
already runs:

```text
pip install -r requirements.txt && alembic upgrade head
```

After both services finish, verify:

```text
https://YOUR-API.onrender.com/health
```

Expected version:

```text
0.7.0-step1d1
```

## Automated deployment verification

Use a configured participant-only demo login for the negative RBAC checks:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify_step1d1.ps1 `
  -ApiUrl "https://YOUR-API.onrender.com" `
  -AdminEmail "YOUR_ADMIN_EMAIL" `
  -AdminPassword "YOUR_ADMIN_PASSWORD" `
  -ParticipantEmail "YOUR_PARTICIPANT_EMAIL" `
  -ParticipantPassword "YOUR_PARTICIPANT_PASSWORD"
```

The script creates one synthetic protocol version in the selected first project.
It begins incomplete, proves that approval is blocked, completes the strata,
approves and hashes the version, verifies retry idempotency and immutability,
confirms activation remains blocked, checks fresh-session persistence, reconciles
protocol counts, preserves Step 1C allocation state, checks audit events and
confirms participant RBAC.

## UI acceptance

Sign in as the administrator and open **Study**.

1. Confirm the header displays `Step 1D.1`.
2. Confirm the metrics show protocol versions, drafts, approved, active and
   `Engine connected: No`.
3. Select the synthetic `acceptance-*` version created by the verifier.
4. Confirm its status is `approved` and the 64-character configuration hash is shown.
5. Confirm the three conditions each show a target of 200.
6. Confirm the experience-band levels, experimental task blocks and block sizes
   `3, 6` are visible.
7. Confirm validation shows `Approval ready`, while activation remains disabled
   until Step 1D.2.
8. Open **Admin** and confirm one event each for `protocol.created`,
   `protocol.updated` and `protocol.approved`.
9. Sign in as the participant-only account. Confirm protocol management is not
   visible and the participant remains limited to the own-record portal.

## Expected automated result

```text
All Step 1D.1 deployment checks passed.
```

## Suggested commit

```text
feat(step-1d1): add versioned protocol and stratification governance
```
