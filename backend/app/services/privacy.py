"""Output boundaries: identity joins are available only through a logged reveal."""
from app.schemas.common import AuditEventOut


def safe_audit(event):
    # Allowlist structured, non-identifying operational fields. Never return
    # historical arbitrary details, IP addresses, account IDs or application joins.
    keys = {"stage", "instrument_version", "synthetic_only", "previous_status",
            "new_status", "allocation_status", "study_group", "method",
            "algorithm_version", "consent_version", "created_account", "role", "configuration_hash"}
    return AuditEventOut(
        id=event.id, actor_user_id=None, action=event.action,
        entity_type=event.entity_type,
        entity_id=event.entity_id if event.entity_type not in {"user", "recruitment_application", "identity_report"} else None,
        details={k: v for k, v in event.details.items() if k in keys},
        ip_address=None, created_at=event.created_at,
    )
