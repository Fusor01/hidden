"""Run every few minutes (cron / scheduler): closes campaigns past their end date and destroys their signing keys."""
from sqlalchemy import select

from common.config import get_settings
from common.db import make_session_factory
from identity_api.deps import utcnow
from identity_api.models import Campaign
from identity_api.services.lifecycle import close_campaign

s = get_settings()
_, Ident = make_session_factory(s.identity_database_url)
_, Anon = make_session_factory(s.anon_admin_database_url or s.ballot_database_url)
with Ident() as db, Anon() as anon:
    for c in db.scalars(select(Campaign).where(Campaign.status == "open", Campaign.ends_at <= utcnow())):
        close_campaign(db, anon, c, None)
        print("closed", c.id)
