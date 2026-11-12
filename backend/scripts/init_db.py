"""Development convenience. In production use Alembic (see README)."""
from ballot_api import models as bm
from common.config import get_settings
from common.db import make_session_factory
from identity_api import models as im

s = get_settings()
im.Base.metadata.create_all(make_session_factory(s.identity_database_url)[0])
bm.Base.metadata.create_all(make_session_factory(s.ballot_database_url)[0])
print("tables created")
