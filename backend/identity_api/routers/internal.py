import hmac
import os

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from identity_api.deps import get_anon_admin_db, get_db, utcnow
from identity_api.models import Campaign
from identity_api.services.lifecycle import close_campaign

router = APIRouter()


@router.get("/close-expired")
def close_expired(authorization: str | None = Header(default=None), db: Session = Depends(get_db),
                  anon: Session = Depends(get_anon_admin_db)):
    """Called by Vercel Cron. Vercel sends 'Authorization: Bearer $CRON_SECRET' when CRON_SECRET is set."""
    secret = os.environ.get("CRON_SECRET")
    if not secret or not hmac.compare_digest(authorization or "", f"Bearer {secret}"):
        raise HTTPException(401, "Unauthorized")
    closed = 0
    for c in db.scalars(select(Campaign).where(Campaign.status == "open", Campaign.ends_at <= utcnow())).all():
        close_campaign(db, anon, c, None)
        closed += 1
    return {"closed": closed}
