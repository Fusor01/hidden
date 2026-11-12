from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from common.config import get_settings
from common.db import make_session_factory
from common.security import b64u_decode, sha256
from identity_api.models import User, UserSession

SESSION_COOKIE = "hidden_session"
_factories: dict[str, object] = {}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _factory(name: str, url: str):
    if name not in _factories:
        _factories[name] = make_session_factory(url)[1]
    return _factories[name]


def get_db():
    with _factory("identity", get_settings().identity_database_url)() as s:
        yield s


def get_anon_admin_db():
    """Publishing campaigns and moderating text. Never used to look up a student."""
    st = get_settings()
    with _factory("anon_admin", st.anon_admin_database_url or st.ballot_database_url)() as s:
        yield s


def get_anon_reports_db():
    """Read side for aggregates. Responses are only ever passed through services/results.py."""
    st = get_settings()
    with _factory("anon_reports", st.anon_reports_database_url or st.ballot_database_url)() as s:
        yield s


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        raise HTTPException(401, "Not authenticated")
    try:
        row = db.get(UserSession, sha256(b64u_decode(raw)))
    except HTTPException:
        raise HTTPException(401, "Not authenticated") from None
    if row is None or aware(row.expires_at) <= utcnow():
        raise HTTPException(401, "Session expired")
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise HTTPException(401, "Not authenticated")
    return user


def require_role(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "Forbidden")
        return user

    return dep
