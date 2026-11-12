from alembic import context
from sqlalchemy import create_engine

from common.config import get_settings
from ballot_api.models import Base

url = get_settings().ballot_database_url
if context.is_offline_mode():
    context.configure(url=url, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    with create_engine(url).connect() as conn:
        context.configure(connection=conn, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
