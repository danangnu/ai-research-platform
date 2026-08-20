from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models import User
from app.schemas.common import LoginRequest, TokenResponse, UserOut
from app.services.audit import write_audit
from app.api.deps import get_current_user


router = APIRouter(prefix="/api/auth", tags=["authentication"])


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        roles=sorted(role.name for role in user.roles),
    )


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    email = payload.email.lower()

    user = db.scalar(
        select(User)
        .options(selectinload(User.roles))
        .where(User.email == email)
    )

    if user is None or not verify_password(payload.password, user.password_hash):
        write_audit(
            db,
            actor=None,
            action="auth.login_failed",
            entity_type="user",
            entity_id=None,
            details={"email": email},
            ip_address=request.client.host if request.client else None,
        )
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled.",
        )

    write_audit(
        db,
        actor=user,
        action="auth.login",
        entity_type="user",
        entity_id=user.id,
        details={},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id),
        user=user_out(user),
    )


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user_out(user)
