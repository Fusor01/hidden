import secrets
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from common.config import get_settings
from common.security import b64u_decode, b64u_encode, client_ip, limiter, sha256
from identity_api.deps import SESSION_COOKIE, current_user, get_db, utcnow, aware
from identity_api.models import Faculty, Student, User, UserSession
from identity_api.schemas import LoginIn

router = APIRouter()
ph = PasswordHasher()
_DUMMY = ph.hash("not-a-real-password")  # equalises timing for unknown emails


def display_name(db: Session, user: User) -> str:
    row = db.get(Student, user.id) if user.role == "student" else db.get(Faculty, user.id) if user.role == "faculty" else None
    return row.name if row else "Administrator"


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    st = get_settings()
    email = body.email.strip().lower()
    limiter.check(f"login-ip:{client_ip(request)}", 20, 60)
    limiter.check(f"login-acct:{email}", 8, 60)
    generic = HTTPException(401, "Invalid credentials")

    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        try:
            ph.verify(_DUMMY, body.password)
        except VerificationError:
            pass
        raise generic
    if not user.is_active or (user.locked_until and aware(user.locked_until) > utcnow()):
        raise generic
    try:
        ph.verify(user.password_hash, body.password)
    except VerificationError:
        user.failed_logins += 1
        if user.failed_logins >= st.max_failed_logins:
            user.locked_until = utcnow() + timedelta(minutes=st.lockout_minutes)
            user.failed_logins = 0
        db.commit()
        raise generic from None

    user.failed_logins, user.locked_until = 0, None
    if ph.check_needs_rehash(user.password_hash):
        user.password_hash = ph.hash(body.password)
    raw = secrets.token_bytes(32)
    db.add(UserSession(id_hash=sha256(raw), user_id=user.id,
                       expires_at=utcnow() + timedelta(minutes=st.session_ttl_minutes)))
    db.commit()
    response.set_cookie(SESSION_COOKIE, b64u_encode(raw), max_age=st.session_ttl_minutes * 60, httponly=True,
                        secure=st.cookie_secure, samesite="lax", path="/")  # host-only: no Domain attribute
    return {"role": user.role, "name": display_name(db, user)}


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(SESSION_COOKIE)
    if raw:
        row = db.get(UserSession, sha256(b64u_decode(raw)))
        if row:
            db.delete(row)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"id": str(user.id), "role": user.role, "name": display_name(db, user)}
