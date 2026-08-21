from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.roles import ALL_ROLES, PARTICIPANT, PROJECT_ADMIN
from app.core.security import hash_password
from app.models import Role, User


def seed_roles_and_admin(db: Session) -> None:
    roles_by_name: dict[str, Role] = {}

    for name, description in ALL_ROLES.items():
        role = db.scalar(select(Role).where(Role.name == name))
        if role is None:
            role = Role(name=name, description=description)
            db.add(role)
            db.flush()

        roles_by_name[name] = role

    admin = db.scalar(
        select(User).where(User.email == settings.admin_email.lower())
    )

    if admin is None:
        admin = User(
            email=settings.admin_email.lower(),
            full_name=settings.admin_full_name,
            password_hash=hash_password(settings.admin_password),
            is_active=True,
        )
        admin.roles.append(roles_by_name[PROJECT_ADMIN])
        db.add(admin)

    elif PROJECT_ADMIN not in {role.name for role in admin.roles}:
        admin.roles.append(roles_by_name[PROJECT_ADMIN])

    if settings.demo_mode:
        participant_email = settings.demo_participant_email.strip().lower()
        participant_password = settings.demo_participant_password

        if bool(participant_email) != bool(participant_password):
            raise RuntimeError(
                "DEMO_PARTICIPANT_EMAIL and DEMO_PARTICIPANT_PASSWORD "
                "must either both be set or both be empty."
            )

        if participant_email:
            if participant_email == settings.admin_email.strip().lower():
                raise RuntimeError(
                    "DEMO_PARTICIPANT_EMAIL must be different from ADMIN_EMAIL."
                )

            participant = db.scalar(
                select(User).where(User.email == participant_email)
            )

            if participant is None:
                participant = User(
                    email=participant_email,
                    full_name=settings.demo_participant_full_name,
                    password_hash=hash_password(participant_password),
                    is_active=True,
                )
                participant.roles.append(roles_by_name[PARTICIPANT])
                db.add(participant)
            else:
                # Demo-only fixture: keep the environment password authoritative
                # so an exposed demo credential can be rotated by redeploying.
                participant.full_name = settings.demo_participant_full_name
                participant.password_hash = hash_password(participant_password)
                participant.is_active = True
                participant.roles = [roles_by_name[PARTICIPANT]]

    db.commit()
