from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.roles import ALL_ROLES, PROJECT_ADMIN
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

    db.commit()
